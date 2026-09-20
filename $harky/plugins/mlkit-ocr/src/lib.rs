#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.mlkitocr";

/// Acceso al reconocimiento de texto on-device (Google ML Kit).
pub struct MlkitOcr<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> MlkitOcr<R> {
    pub fn recognize_text(&self, image_base64: String) -> crate::Result<RecognizeResult> {
        self.0
            .run_mobile_plugin("recognize_text", RecognizeArgs { image_base64 })
            .map_err(Into::into)
    }
}

pub trait MlkitOcrExt<R: Runtime> {
    fn mlkit_ocr(&self) -> &MlkitOcr<R>;
}

impl<R: Runtime, T: Manager<R>> MlkitOcrExt<R> for T {
    fn mlkit_ocr(&self) -> &MlkitOcr<R> {
        self.state::<MlkitOcr<R>>().inner()
    }
}

/// Inicializa el plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("mlkit-ocr")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "MlkitOcrPlugin")?;
            app.manage(MlkitOcr(handle));
            Ok(())
        })
        .build()
}
