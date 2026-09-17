//! Хранилище lincom: SQLite, один файл в app_data_dir.

use rusqlite::{params, Connection};

use crate::models::{AppData, Folder, Link};

pub type DbResult<T> = Result<T, Box<dyn std::error::Error>>;

pub struct Database {
    conn: Connection,
    pub path: std::path::PathBuf,
}

impl Database {
    pub fn open(path: &std::path::Path) -> DbResult<Self> {
        eprintln!("[lincom] opening database at: {}", path.display());
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        let db = Self { conn, path: path.to_path_buf() };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> DbResult<()> {
        self.conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS folders (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                is_zero    INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS links (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id     INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
                title         TEXT    NOT NULL,
                url           TEXT    NOT NULL,
                description   TEXT    NOT NULL DEFAULT '',
                is_favorite   INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT    NOT NULL DEFAULT '',
                updated_at    TEXT    NOT NULL DEFAULT ''
            );",
        )?;

        let columns: Vec<String> = {
            let mut st = self.conn.prepare("PRAGMA table_info(links)")?;
            let rows = st.query_map([], |r| r.get::<_, String>(1))?;
            let mut out = Vec::new();
            for row in rows {
                if let Ok(name) = row {
                    out.push(name);
                }
            }
            out
        };

        if !columns.iter().any(|c| c == "is_favorite") {
            self.conn.execute_batch(
                "ALTER TABLE links ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;",
            )?;
        }
        if !columns.iter().any(|c| c == "updated_at") {
            self.conn.execute_batch("ALTER TABLE links ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';")?;
            self.conn.execute_batch("UPDATE links SET updated_at = datetime('now') WHERE updated_at = '';")?;
        }
        if !columns.iter().any(|c| c == "created_at") {
            self.conn.execute_batch("ALTER TABLE links ADD COLUMN created_at TEXT NOT NULL DEFAULT '';")?;
            self.conn.execute_batch("UPDATE links SET created_at = datetime('now') WHERE created_at = '';")?;
        }

        let folder_columns: Vec<String> = {
            let mut st = self.conn.prepare("PRAGMA table_info(folders)")?;
            let rows = st.query_map([], |r| r.get::<_, String>(1))?;
            let mut out = Vec::new();
            for row in rows {
                if let Ok(name) = row {
                    out.push(name);
                }
            }
            out
        };

        if !folder_columns.iter().any(|c| c == "sort_order") {
            self.conn.execute_batch(
                "ALTER TABLE folders ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;",
            )?;
            self.conn.execute_batch(
                "UPDATE folders SET sort_order = id WHERE sort_order = 0;",
            )?;
        }

        let zero_count: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM folders WHERE is_zero = 1",
            [],
            |r| r.get(0),
        )?;
        if zero_count == 0 {
            self.conn.execute(
                "INSERT INTO folders (name, is_zero, sort_order) VALUES ('Main', 1, 0)",
                [],
            )?;
        }
        Ok(())
    }

    pub fn load_all(&self) -> DbResult<AppData> {
        let mut folders = Vec::new();
        {
            let mut st = self.conn.prepare(
                "SELECT id, name, is_zero, sort_order FROM folders
                 ORDER BY is_zero DESC, sort_order ASC, name COLLATE NOCASE",
            )?;
            let rows = st.query_map([], |r| {
                Ok(Folder {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    is_zero: r.get::<_, i64>(2)? != 0,
                    sort_order: r.get(3)?,
                })
            })?;
            for f in rows {
                folders.push(f?);
            }
        }
        let mut links = Vec::new();
        {
            let mut st = self.conn.prepare(
                "SELECT id, folder_id, title, url, description, is_favorite, updated_at
                 FROM links ORDER BY id",
            )?;
            let rows = st.query_map([], |r| {
                Ok(Link {
                    id: r.get(0)?,
                    folder_id: r.get(1)?,
                    title: r.get(2)?,
                    url: r.get(3)?,
                    description: r.get(4)?,
                    is_favorite: r.get::<_, i64>(5)? != 0,
                    updated_at: r.get(6)?,
                })
            })?;
            for l in rows {
                links.push(l?);
            }
        }
        Ok(AppData { folders, links })
    }

    pub fn create_folder(&self, name: &str) -> DbResult<Folder> {
        let max_order: i64 = self.conn.query_row(
            "SELECT COALESCE(MAX(sort_order), 0) FROM folders",
            [],
            |r| r.get(0),
        )?;
        self.conn.execute(
            "INSERT INTO folders (name, is_zero, sort_order) VALUES (?1, 0, ?2)",
            params![name, max_order + 1],
        )?;
        Ok(Folder {
            id: self.conn.last_insert_rowid(),
            name: name.to_string(),
            is_zero: false,
            sort_order: max_order + 1,
        })
    }

    pub fn create_link(
        &self,
        folder_id: i64,
        title: &str,
        url: &str,
        description: &str,
    ) -> DbResult<Link> {
        self.conn.execute(
            "INSERT INTO links (folder_id, title, url, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
            params![folder_id, title, url, description],
        )?;
        let id = self.conn.last_insert_rowid();
        self.conn
            .query_row(
                "SELECT id, folder_id, title, url, description, is_favorite, updated_at
                 FROM links WHERE id = ?1",
                params![id],
                |r| {
                    Ok(Link {
                        id: r.get(0)?,
                        folder_id: r.get(1)?,
                        title: r.get(2)?,
                        url: r.get(3)?,
                        description: r.get(4)?,
                        is_favorite: r.get::<_, i64>(5)? != 0,
                        updated_at: r.get(6)?,
                    })
                },
            )
            .map_err(Into::into)
    }

    pub fn update_folder(&self, id: i64, name: &str) -> DbResult<()> {
        self.conn.execute(
            "UPDATE folders SET name = ?1 WHERE id = ?2",
            params![name, id],
        )?;
        Ok(())
    }

    pub fn update_link(&self, id: i64, title: &str, url: &str, description: &str) -> DbResult<()> {
        self.conn.execute(
            "UPDATE links SET title = ?1, url = ?2, description = ?3,
                            updated_at = datetime('now') WHERE id = ?4",
            params![title, url, description, id],
        )?;
        Ok(())
    }

    pub fn toggle_favorite(&self, id: i64) -> DbResult<bool> {
        let current: i64 = self.conn.query_row(
            "SELECT is_favorite FROM links WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )?;
        let new = if current == 0 { 1 } else { 0 };
        self.conn.execute(
            "UPDATE links SET is_favorite = ?1, updated_at = datetime('now') WHERE id = ?2",
            params![new, id],
        )?;
        Ok(new != 0)
    }

    pub fn delete_folder(&self, id: i64) -> DbResult<()> {
        self.conn.execute(
            "DELETE FROM folders WHERE id = ?1 AND is_zero = 0",
            params![id],
        )?;
        Ok(())
    }

    pub fn delete_link(&self, id: i64) -> DbResult<()> {
        self.conn.execute("DELETE FROM links WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn reorder_folders(&self, ids: &[i64]) -> DbResult<()> {
        let tx = self.conn.unchecked_transaction()?;
        for (i, id) in ids.iter().enumerate() {
            self.conn.execute(
                "UPDATE folders SET sort_order = ?1 WHERE id = ?2",
                params![i as i64, id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}
