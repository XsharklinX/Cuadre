#![cfg(target_os = "android")]

use tauri::{
    plugin::{Builder, PluginHandle, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

mod error;
mod models;

pub use error::{Error, Result};

const PLUGIN_IDENTIFIER: &str = "com.sharky.finanzas.inappupdate";

/// ACTUALIZAR SIN SALIR DE LA APP (Google Play In-App Updates).
///
/// El problema que resuelve esta medido, no supuesto: la app tenia un aviso de
/// "hay version nueva" que comparaba contra un `version.json` publicado a mano.
/// Ese archivo se quedo en 1.7.4 mientras la app llegaba a la 1.9.6, asi que el
/// aviso llevaba NUEVE VERSIONES sin aparecerle a nadie. Y aunque hubiera
/// aparecido, su boton solo abria la ficha de Play: seguia dependiendo de que
/// la persona encontrara el boton "Actualizar" ahi dentro.
///
/// Aqui la fuente de verdad es Play. No hay archivo que mantener, no hay nada
/// que se pueda olvidar, y la descarga e instalacion ocurren dentro de la app.
///
/// LIMITACION QUE HAY QUE TENER PRESENTE: esto SOLO funciona en una copia
/// instalada desde Google Play. En una compilacion de desarrollo o descargada
/// a mano, la API responde con error — no es un fallo nuestro y no se puede
/// evitar. Para poder probar la interfaz sin Play existe el simulador del
/// panel de desarrollador.
pub struct InAppUpdate<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> InAppUpdate<R> {
    /// Le pregunta a Play si hay algo mas nuevo que lo instalado.
    pub fn check(&self) -> crate::Result<CheckResult> {
        self.0
            .run_mobile_plugin("check", Empty {})
            .map_err(Into::into)
    }

    /// Lanza el flujo de actualizacion (de fondo o a pantalla completa).
    pub fn start(&self, immediate: bool) -> crate::Result<StartResult> {
        self.0
            .run_mobile_plugin("start", StartArgs { immediate })
            .map_err(Into::into)
    }

    /// Instala lo ya descargado. Reinicia la app.
    pub fn install(&self) -> crate::Result<InstallResult> {
        self.0
            .run_mobile_plugin("install", Empty {})
            .map_err(Into::into)
    }
}

pub trait InAppUpdateExt<R: Runtime> {
    fn in_app_update(&self) -> &InAppUpdate<R>;
}

impl<R: Runtime, T: Manager<R>> InAppUpdateExt<R> for T {
    fn in_app_update(&self) -> &InAppUpdate<R> {
        self.state::<InAppUpdate<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("in-app-update")
        .setup(|app, api| {
            let handle = api.register_android_plugin(PLUGIN_IDENTIFIER, "InAppUpdatePlugin")?;
            app.manage(InAppUpdate(handle));
            Ok(())
        })
        .build()
}
