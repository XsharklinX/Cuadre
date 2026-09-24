use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct Empty {}

/// Lo que Google Play dice sobre si hay algo nuevo.
///
/// La fuente de verdad es Play, no un archivo nuestro. Antes esto se resolvia
/// con un `version.json` publicado a mano en GitHub Pages, y el resultado fue
/// que se quedo clavado en 1.7.4 mientras la app iba por la 1.9.6: durante
/// nueve versiones NADIE vio el aviso de actualizar. Un dato que hay que
/// acordarse de actualizar a mano es un dato que algun dia estara mal.
#[derive(Debug, Clone, Deserialize)]
pub struct CheckResult {
    /// `true` solo si Play confirma que hay una version mas nueva disponible.
    pub available: bool,
    /// El `versionCode` que ofrece Play. Ausente si no hay nada que ofrecer.
    pub version_code: Option<i64>,
    /// Dias que lleva publicada. Sirve para insistir mas segun envejece.
    pub staleness_days: Option<i64>,
    /// Se puede descargar de fondo mientras la persona sigue usando la app.
    pub flexible_allowed: bool,
    /// Se puede actualizar a pantalla completa, bloqueando la app.
    pub immediate_allowed: bool,
    /// Ya esta descargada de una sesion anterior: solo falta instalarla.
    pub downloaded: bool,
    /// Por que no se pudo preguntar. Para el panel de desarrollador, nunca
    /// para enseñarselo al usuario.
    pub reason: Option<String>,
}

/// Como se pide la actualizacion.
#[derive(Debug, Clone, Serialize)]
pub struct StartArgs {
    /// `true` = pantalla completa de Google, bloquea la app hasta terminar.
    /// `false` = descarga de fondo y la persona sigue usando la app.
    pub immediate: bool,
}

/// El resultado de lanzar el flujo.
#[derive(Debug, Clone, Deserialize)]
pub struct StartResult {
    /// `true` si el flujo arranco. No significa que ya se instalo.
    pub started: bool,
    /// La persona lo rechazo en el dialogo de Google.
    pub cancelled: bool,
    pub reason: Option<String>,
}

/// Instalar lo ya descargado. Reinicia la app: es inevitable y hay que
/// avisarlo antes, nunca sorprender a alguien a mitad de escribir un gasto.
#[derive(Debug, Clone, Deserialize)]
pub struct InstallResult {
    pub ok: bool,
    pub reason: Option<String>,
}
