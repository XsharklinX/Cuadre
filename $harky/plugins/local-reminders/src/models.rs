use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncSnapshotArgs {
    pub snapshot: String,
}

#[derive(Debug, Serialize)]
pub struct NoArgs {}

#[derive(Debug, Clone, Deserialize)]
pub struct Empty {}
