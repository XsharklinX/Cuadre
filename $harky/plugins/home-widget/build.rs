// El JS invoca estos 4 comandos; si no estan todos aqui, Tauri no genera su
// permiso ACL y el invoke() se rechaza en silencio. Faltaban get_diagnostics,
// refresh_widgets y request_pin — por eso el boton "anadir widget" y el
// diagnostico no hacian nada.
const COMMANDS: &[&str] = &["sync_snapshot", "get_diagnostics", "refresh_widgets", "request_pin"];

fn main() {
    let result = tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .try_build();

    // when building documentation for Android the plugin build result is always Err() and is irrelevant to the crate documentation build
    if !(cfg!(docsrs) && std::env::var("TARGET").unwrap().contains("android")) {
        result.unwrap();
    }
}
