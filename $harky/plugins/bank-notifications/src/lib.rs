#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.banknotifications";

/// Acceso de notificaciones del sistema para detectar transacciones bancarias.
pub struct BankNotifications<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> BankNotifications<R> {
    pub fn has_access(&self) -> crate::Result<HasAccessResult> {
        self.0
            .run_mobile_plugin("has_access", NoArgs {})
            .map_err(Into::into)
    }

    pub fn open_settings(&self) -> crate::Result<()> {
        self.0
            .run_mobile_plugin::<Empty>("open_settings", NoArgs {})
            .map(|_| ())
            .map_err(Into::into)
    }
}

pub trait BankNotificationsExt<R: Runtime> {
    fn bank_notifications(&self) -> &BankNotifications<R>;
}

impl<R: Runtime, T: Manager<R>> BankNotificationsExt<R> for T {
    fn bank_notifications(&self) -> &BankNotifications<R> {
        self.state::<BankNotifications<R>>().inner()
    }
}

/// Inicializa el plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("bank-notifications")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "BankNotificationsPlugin")?;
            app.manage(BankNotifications(handle));
            Ok(())
        })
        .build()
}
