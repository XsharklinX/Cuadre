#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.keystore";

/// Cifrado/descifrado respaldado por una clave no exportable de Android Keystore.
pub struct Keystore<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Keystore<R> {
    pub fn encrypt(&self, plaintext: String) -> crate::Result<EncryptResult> {
        self.0
            .run_mobile_plugin("encrypt", EncryptArgs { plaintext })
            .map_err(Into::into)
    }

    pub fn decrypt(&self, iv: String, data: String) -> crate::Result<DecryptResult> {
        self.0
            .run_mobile_plugin("decrypt", DecryptArgs { iv, data })
            .map_err(Into::into)
    }
}

pub trait KeystoreExt<R: Runtime> {
    fn keystore(&self) -> &Keystore<R>;
}

impl<R: Runtime, T: Manager<R>> KeystoreExt<R> for T {
    fn keystore(&self) -> &Keystore<R> {
        self.state::<Keystore<R>>().inner()
    }
}

/// Inicializa el plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("keystore")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "KeystorePlugin")?;
            app.manage(Keystore(handle));
            Ok(())
        })
        .build()
}
