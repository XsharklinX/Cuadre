#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.localreminders";

/// Recordatorios locales y tareas de fondo (WorkManager): avisos de
/// presupuesto/pagos, backup semanal por SAF, barras del sistema, notificación
/// de "agregar rápido" y hoja nativa de compartir. Todos los comandos que
/// invoca el JS los atiende directamente el plugin Android; aquí solo se
/// registra el puente. Los nombres de comando viven en build.rs (COMMANDS),
/// que es lo que genera su permiso ACL.
pub struct LocalReminders<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> LocalReminders<R> {
    pub fn sync_snapshot(&self, snapshot: String) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<Empty>("syncSnapshot", SyncSnapshotArgs { snapshot })
            .map(|_| ())
            .map_err(Into::into)
    }

    pub fn schedule_reminders(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<Empty>("scheduleReminders", NoArgs {})
            .map(|_| ())
            .map_err(Into::into)
    }

    pub fn cancel_reminders(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<Empty>("cancelReminders", NoArgs {})
            .map(|_| ())
            .map_err(Into::into)
    }
}

pub trait LocalRemindersExt<R: Runtime> {
    fn local_reminders(&self) -> &LocalReminders<R>;
}

impl<R: Runtime, T: Manager<R>> LocalRemindersExt<R> for T {
    fn local_reminders(&self) -> &LocalReminders<R> {
        self.state::<LocalReminders<R>>().inner()
    }
}

/// Inicializa el plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("local-reminders")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "LocalRemindersPlugin")?;
            app.manage(LocalReminders(handle));
            Ok(())
        })
        .build()
}
