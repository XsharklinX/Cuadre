use tauri::Manager;

#[tauri::command]
fn write_file(path: String, contents: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_to_downloads(filename: String, contents: Vec<u8>) -> Result<String, String> {
    let download_dir = "/storage/emulated/0/Download";
    let mut path = std::path::PathBuf::from(download_dir);
    path.push(&filename);
    
    // Si el archivo ya existe, añadir sufijo para no sobreescribir
    let mut final_path = path.clone();
    let mut counter = 1;
    while final_path.exists() {
        let name = path.file_stem().unwrap().to_string_lossy();
        let ext = path.extension().unwrap_or_default().to_string_lossy();
        final_path = std::path::PathBuf::from(download_dir);
        final_path.push(format!("{}_{}.{}", name, counter, ext));
        counter += 1;
    }
    
    std::fs::write(&final_path, contents).map_err(|e| e.to_string())?;
    Ok(final_path.to_string_lossy().into_owned())
}

/// Lee un backup desde una ruta específica.
#[tauri::command]
fn read_backup(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

/// Guarda un archivo en la carpeta "Sharky Finance" (Descargas en Android,
/// Documentos en desktop) o, si se indica `folder`, directamente en esa
/// carpeta (ruta absoluta ya resuelta por el lado JS — el usuario la eligió).
/// Crea la carpeta si no existe. Sobrescribe sin sufijo: se usa para backups
/// (manuales y el automático semanal), que deben reemplazar al anterior en
/// vez de acumularse.
#[tauri::command]
fn save_to_app_folder(app: tauri::AppHandle, filename: String, contents: Vec<u8>, folder: Option<String>) -> Result<String, String> {
    let dir = match folder {
        Some(f) => std::path::PathBuf::from(f),
        None => {
            let mut d = if cfg!(target_os = "android") {
                std::path::PathBuf::from("/storage/emulated/0/Download")
            } else {
                app.path().document_dir().map_err(|e| e.to_string())?
            };
            d.push("Sharky Finance");
            d
        }
    };
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Archivo (foto/PDF de recibo) recibido vía "Compartir" desde otra app.
/// Lo escribe `MainActivity.kt` en `{cache_dir}/shared/` cuando llega un
/// intent `ACTION_SEND`; este lado lo consume una sola vez (lo borra al leerlo).
#[derive(serde::Serialize)]
struct SharedFile {
    #[serde(rename = "dataUrl")]
    data_url: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
    name: String,
}

#[derive(serde::Deserialize)]
struct SharedFileMarker {
    path: String,
    #[serde(rename = "mimeType")]
    mime_type: String,
    name: String,
}

/// Lee y consume los recibos compartidos pendientes (si hay alguno). El
/// marcador (`pending.json`) siempre es un array, aunque el usuario haya
/// compartido un solo archivo — así el lado JS maneja un único caso (lote de
/// tamaño N, N puede ser 1) en vez de dos formas distintas. Devuelve un
/// vector vacío si el usuario no compartió nada hacia la app.
#[tauri::command]
fn take_pending_shared_files(app: tauri::AppHandle) -> Result<Vec<SharedFile>, String> {
    use base64::Engine;

    let cache_dir = app.path().app_cache_dir().map_err(|e: tauri::Error| e.to_string())?;
    let shared_dir = cache_dir.join("shared");
    let marker_path = shared_dir.join("pending.json");
    if !marker_path.exists() {
        return Ok(Vec::new());
    }

    let marker_json = std::fs::read_to_string(&marker_path).map_err(|e| e.to_string())?;
    let markers: Vec<SharedFileMarker> = serde_json::from_str(&marker_json).map_err(|e| e.to_string())?;

    let mut files = Vec::with_capacity(markers.len());
    for marker in &markers {
        let bytes = std::fs::read(&marker.path).map_err(|e| e.to_string())?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&bytes);
        let data_url = format!("data:{};base64,{}", marker.mime_type, encoded);
        files.push(SharedFile {
            data_url,
            mime_type: marker.mime_type.clone(),
            name: marker.name.clone(),
        });
        let _ = std::fs::remove_file(&marker.path);
    }
    let _ = std::fs::remove_file(&marker_path);

    Ok(files)
}

/// Atajo pendiente (widget o icono mantenido) que `MainActivity.kt` dejo en
/// `{cache_dir}/shortcut.txt`.
///
/// Es una RED DE SEGURIDAD para el deep link. El plugin `deep-link` deberia
/// entregar `sharky://shortcut/...` por `onOpenUrl`/`getCurrent`, pero en la
/// practica (ver el comentario en `store/auth.ts`) hay dispositivos donde el
/// evento no llega en warm-start — la app pasa a primer plano pero se queda en
/// Inicio. El flujo de "compartir" ya esquiva ese problema escribiendo un
/// marcador desde MainActivity; esto hace lo mismo para los atajos. Se consume
/// una sola vez (se borra al leerlo).
#[tauri::command]
fn take_pending_shortcut(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e: tauri::Error| e.to_string())?;
    let marker_path = cache_dir.join("shortcut.txt");
    if !marker_path.exists() {
        return Ok(None);
    }
    let value = std::fs::read_to_string(&marker_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&marker_path);
    let trimmed = value.trim().to_string();
    Ok(if trimmed.is_empty() { None } else { Some(trimmed) })
}

/// Aviso nativo pendiente (tocado desde la bandeja de Android) que
/// `MainActivity.kt` dejo en `{cache_dir}/notification.txt`.
///
/// Misma red de seguridad que `take_pending_shortcut`, para el deep link
/// `sharky://notification/<tipo>` que abre `ReminderWorker` al notificar
/// presupuesto/semanal/etc. Se consume una sola vez (se borra al leerlo).
#[tauri::command]
fn take_pending_notification(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let cache_dir = app.path().app_cache_dir().map_err(|e: tauri::Error| e.to_string())?;
    let marker_path = cache_dir.join("notification.txt");
    if !marker_path.exists() {
        return Ok(None);
    }
    let value = std::fs::read_to_string(&marker_path).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&marker_path);
    let trimmed = value.trim().to_string();
    Ok(if trimmed.is_empty() { None } else { Some(trimmed) })
}

/// Historial de avisos nativos ya disparados (`ReminderWorker.kt` lo escribe
/// en `{files_dir}/notification_history.json`, capado a las últimas ~100
/// entradas). A diferencia de `take_pending_notification`, esto NO se
/// consume/borra al leerlo — el lado JS hace merge por id contra su propio
/// store persistido, así que releer el mismo archivo varias veces es
/// inofensivo (idempotente).
#[tauri::command]
fn read_notification_history(app: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app.path().app_data_dir().map_err(|e: tauri::Error| e.to_string())?;
    let path = data_dir.join("notification_history.json");
    if !path.exists() {
        return Ok("[]".to_string());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

const SECURE_STORAGE_SERVICE: &str = "com.sharky.miapp";
// Nombre anterior del servicio keyring. Al leer, si la clave no existe bajo el
// nombre nuevo se busca bajo el viejo y se migra (una sola vez por clave).
const LEGACY_SECURE_STORAGE_SERVICE: &str = "com.sharky.finanzas";
const DESKTOP_PWA_CACHE_RESET_SCRIPT: &str = r#"
(async () => {
  const resetKey = "sharky-desktop-pwa-reset-v1";
  if (sessionStorage.getItem(resetKey)) return;

  sessionStorage.setItem(resetKey, "1");
  const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? [];
  const cacheNames = await globalThis.caches?.keys?.() ?? [];

  await Promise.all(registrations.map((registration) => registration.unregister()));
  await Promise.all(cacheNames.map((cacheName) => globalThis.caches.delete(cacheName)));

  if (registrations.length || cacheNames.length) {
    globalThis.location.reload();
  }
})().catch(console.error);
"#;

#[cfg(any(target_os = "linux", windows))]
use tauri_plugin_deep_link::DeepLinkExt;

#[cfg(any(target_os = "linux", windows))]
fn register_desktop_deep_links(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    app.deep_link().register_all()?;
    Ok(())
}

#[cfg(not(any(target_os = "linux", windows)))]
fn register_desktop_deep_links(_app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

/// Guarda sesiones Supabase en el almacén de credenciales del sistema operativo.
/// El frontend solo recibe el valor mientras el SDK necesita refrescar la sesión.
#[tauri::command]
fn secure_storage_set(key: String, value: String) -> Result<(), String> {
    keyring::Entry::new(SECURE_STORAGE_SERVICE, &key)
        .map_err(|e| e.to_string())?
        .set_password(&value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn secure_storage_get(key: String) -> Result<Option<String>, String> {
    match keyring::Entry::new(SECURE_STORAGE_SERVICE, &key)
        .map_err(|e| e.to_string())?
        .get_password()
    {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => {
            // Migración desde el nombre de servicio anterior
            let legacy = keyring::Entry::new(LEGACY_SECURE_STORAGE_SERVICE, &key)
                .map_err(|e| e.to_string())?;
            match legacy.get_password() {
                Ok(value) => {
                    if secure_storage_set(key, value.clone()).is_ok() {
                        let _ = legacy.delete_credential();
                    }
                    Ok(Some(value))
                }
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(error) => Err(error.to_string()),
            }
        }
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
fn secure_storage_remove(key: String) -> Result<(), String> {
    match keyring::Entry::new(SECURE_STORAGE_SERVICE, &key)
        .map_err(|e| e.to_string())?
        .delete_credential()
    {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(mobile)]
    {
        builder = builder.plugin(tauri_plugin_biometric::init());
    }

    #[cfg(target_os = "android")]
    {
        builder = builder.plugin(tauri_plugin_mlkit_ocr::init());
        builder = builder.plugin(tauri_plugin_local_reminders::init());
        builder = builder.plugin(tauri_plugin_bank_notifications::init());
        builder = builder.plugin(tauri_plugin_keystore::init());
        builder = builder.plugin(tauri_plugin_home_widget::init());
    }

    builder
        .setup(|app| register_desktop_deep_links(app))
        .on_page_load(|webview, _| {
            let _ = webview.eval(DESKTOP_PWA_CACHE_RESET_SCRIPT);
        })
        .invoke_handler(tauri::generate_handler![
            write_file,
            save_to_downloads,
            save_to_app_folder,
            read_backup,
            take_pending_shortcut,
            take_pending_notification,
            read_notification_history,
            secure_storage_set,
            secure_storage_get,
            secure_storage_remove,
            take_pending_shared_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application")
}

#[cfg(test)]
mod tests {
    use super::{secure_storage_get, secure_storage_remove, secure_storage_set};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn secure_storage_roundtrip() {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be valid")
            .as_nanos();
        let key = format!("sharky-test-{suffix}");
        let secret = "temporary-refresh-token".to_string();

        secure_storage_set(key.clone(), secret.clone()).expect("credential should be written");
        assert_eq!(
            secure_storage_get(key.clone()).expect("credential should be read"),
            Some(secret)
        );
        secure_storage_remove(key.clone()).expect("credential should be removed");
        assert_eq!(
            secure_storage_get(key).expect("missing credential should be handled"),
            None
        );
    }
}
