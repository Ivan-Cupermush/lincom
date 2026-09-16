//! lincom — Tauri-ядро: состояние БД + команды для фронтенда.

mod db;
mod models;

use std::sync::Mutex;

use tauri::{Manager, State};

use crate::db::Database;
use crate::models::AppData;

pub struct AppState(pub Mutex<Database>);

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
fn load_all(state: State<AppState>) -> CmdResult<AppData> {
    state.0.lock().map_err(err)?.load_all().map_err(err)
}

#[tauri::command]
fn create_folder(state: State<AppState>, name: String) -> CmdResult<i64> {
    let folder = state.0.lock().map_err(err)?.create_folder(&name).map_err(err)?;
    Ok(folder.id)
}

#[tauri::command]
fn create_link(
    state: State<AppState>,
    folder_id: i64,
    title: String,
    url: String,
    description: String,
) -> CmdResult<i64> {
    let link = state
        .0
        .lock()
        .map_err(err)?
        .create_link(folder_id, &title, &url, &description)
        .map_err(err)?;
    Ok(link.id)
}

#[tauri::command]
fn update_folder(state: State<AppState>, id: i64, name: String) -> CmdResult<()> {
    state.0.lock().map_err(err)?.update_folder(id, &name).map_err(err)
}

#[tauri::command]
fn update_link(
    state: State<AppState>,
    id: i64,
    title: String,
    url: String,
    description: String,
) -> CmdResult<()> {
    state
        .0
        .lock()
        .map_err(err)?
        .update_link(id, &title, &url, &description)
        .map_err(err)
}

#[tauri::command]
fn toggle_favorite(state: State<AppState>, id: i64) -> CmdResult<bool> {
    state.0.lock().map_err(err)?.toggle_favorite(id).map_err(err)
}

#[tauri::command]
fn delete_folder(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.0.lock().map_err(err)?.delete_folder(id).map_err(err)
}

#[tauri::command]
fn delete_link(state: State<AppState>, id: i64) -> CmdResult<()> {
    state.0.lock().map_err(err)?.delete_link(id).map_err(err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().map_err(err)?;
            std::fs::create_dir_all(&dir).map_err(err)?;
            let database = Database::open(&dir.join("links.db")).map_err(err)?;
            app.manage(AppState(Mutex::new(database)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_all,
            create_folder,
            create_link,
            update_folder,
            update_link,
            toggle_favorite,
            delete_folder,
            delete_link
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
