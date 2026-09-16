//! DTO-модели, общие для бэкенда и фронтенда (serde -> camelCase в JSON).

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: i64,
    pub name: String,
    pub is_zero: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Link {
    pub id: i64,
    pub folder_id: i64,
    pub title: String,
    pub url: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppData {
    pub folders: Vec<Folder>,
    pub links: Vec<Link>,
}
