#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.homewidget";

/// Puente hacia los widgets de pantalla de inicio (saldo, presupuestos,
/// conversor y acceso rápido). Los comandos que invoca el JS
/// (`sync_snapshot`, `get_diagnostics`, `refresh_widgets`, `request_pin`) los
/// atiende directamente el plugin Android; aquí solo se registra el puente.
pub struct HomeWidget<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> HomeWidget<R> {
    pub fn sync_snapshot(&self, snapshot: String) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<Empty>("syncSnapshot", SyncSnapshotArgs { snapshot })
            .map(|_| ())
            .map_err(Into::into)
    }
}

pub trait HomeWidgetExt<R: Runtime> {
    fn home_widget(&self) -> &HomeWidget<R>;
}

impl<R: Runtime, T: Manager<R>> HomeWidgetExt<R> for T {
    fn home_widget(&self) -> &HomeWidget<R> {
        self.state::<HomeWidget<R>>().inner()
    }
}

/// Inicializa el plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("home-widget")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "HomeWidgetPlugin")?;
            app.manage(HomeWidget(handle));
            Ok(())
        })
        .build()
}
