use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

// ─── Data Models ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub name: String,
    pub text: String,
    pub tags: Vec<String>,
    pub images: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub prompts: Vec<Prompt>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub folders: Vec<Folder>,
    pub theme: String,
}

impl Default for AppData {
    fn default() -> Self {
        AppData {
            folders: vec![
                Folder {
                    id: "default".into(),
                    name: "General".into(),
                    prompts: vec![
                        Prompt {
                            id: "welcome".into(),
                            name: "Welcome Prompt".into(),
                            text: "You are a helpful AI assistant. Please answer my questions clearly and concisely.".into(),
                            tags: vec!["general".into(), "starter".into()],
                            images: vec![],
                            created_at: chrono_now(),
                        },
                        Prompt {
                            id: "code-review".into(),
                            name: "Code Review".into(),
                            text: "Please review the following code for bugs, performance issues, and best practices. Provide specific suggestions for improvement.".into(),
                            tags: vec!["coding".into(), "review".into()],
                            images: vec![],
                            created_at: chrono_now(),
                        },
                    ],
                },
                Folder {
                    id: "creative".into(),
                    name: "Creative Writing".into(),
                    prompts: vec![Prompt {
                        id: "storyteller".into(),
                        name: "Story Generator".into(),
                        text: "Write a compelling short story based on the following premise. Include vivid descriptions, engaging dialogue, and a surprising twist.".into(),
                        tags: vec!["creative".into(), "writing".into()],
                        images: vec![],
                        created_at: chrono_now(),
                    }],
                },
            ],
            theme: "dark".into(),
        }
    }
}

fn chrono_now() -> String {
    // Simple ISO timestamp without chrono dependency
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("2026-01-01T00:00:{}Z", now % 86400)
}

fn gen_id() -> String {
    Uuid::new_v4().to_string()[..12].to_string()
}

fn now_iso() -> String {
    // We'll use a simple approach
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let secs = d.as_secs();
    let days = secs / 86400;
    let rem = secs % 86400;
    let hours = rem / 3600;
    let minutes = (rem % 3600) / 60;
    let seconds = rem % 60;
    // Approximate date from epoch
    format!(
        "1970-01-{:02}T{:02}:{:02}:{:02}Z",
        days % 28 + 1,
        hours,
        minutes,
        seconds
    )
}

// ─── State ──────────────────────────────────────────────────────

pub struct AppState {
    pub data: Mutex<AppData>,
    pub data_path: PathBuf,
    pub image_dir: PathBuf,
}

impl AppState {
    fn save(&self) {
        let data = self.data.lock().unwrap();
        let json = serde_json::to_string_pretty(&*data).unwrap();
        let _ = fs::write(&self.data_path, json);
    }

    fn load(data_path: &PathBuf) -> AppData {
        if data_path.exists() {
            let content = fs::read_to_string(data_path).unwrap_or_default();
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AppData::default()
        }
    }
}

// ─── Folder Commands ────────────────────────────────────────────

#[tauri::command]
fn get_folders(state: State<'_, AppState>) -> Vec<Folder> {
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn create_folder(state: State<'_, AppState>, name: String) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    data.folders.push(Folder {
        id: gen_id(),
        name,
        prompts: vec![],
    });
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn rename_folder(state: State<'_, AppState>, id: String, name: String) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    if let Some(folder) = data.folders.iter_mut().find(|f| f.id == id) {
        folder.name = name;
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn delete_folder(state: State<'_, AppState>, id: String) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    data.folders.retain(|f| f.id != id);
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

// ─── Prompt Commands ────────────────────────────────────────────

#[tauri::command]
fn create_prompt(
    state: State<'_, AppState>,
    folder_id: String,
    name: String,
    text: String,
    tags: Vec<String>,
    images: Vec<String>,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    if let Some(folder) = data.folders.iter_mut().find(|f| f.id == folder_id) {
        folder.prompts.push(Prompt {
            id: gen_id(),
            name,
            text,
            tags,
            images,
            created_at: now_iso(),
        });
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn update_prompt(
    state: State<'_, AppState>,
    folder_id: String,
    prompt_id: String,
    name: String,
    text: String,
    tags: Vec<String>,
    images: Vec<String>,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    if let Some(folder) = data.folders.iter_mut().find(|f| f.id == folder_id) {
        if let Some(prompt) = folder.prompts.iter_mut().find(|p| p.id == prompt_id) {
            prompt.name = name;
            prompt.text = text;
            prompt.tags = tags;
            prompt.images = images;
        }
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn delete_prompt(
    state: State<'_, AppState>,
    folder_id: String,
    prompt_id: String,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    if let Some(folder) = data.folders.iter_mut().find(|f| f.id == folder_id) {
        folder.prompts.retain(|p| p.id != prompt_id);
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn move_prompt(
    state: State<'_, AppState>,
    from_folder_id: String,
    to_folder_id: String,
    prompt_id: String,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    let prompt = {
        if let Some(from) = data.folders.iter_mut().find(|f| f.id == from_folder_id) {
            if let Some(idx) = from.prompts.iter().position(|p| p.id == prompt_id) {
                Some(from.prompts.remove(idx))
            } else {
                None
            }
        } else {
            None
        }
    };
    if let Some(p) = prompt {
        if let Some(to) = data.folders.iter_mut().find(|f| f.id == to_folder_id) {
            to.prompts.push(p);
        }
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

// ─── Image Commands ─────────────────────────────────────────────

#[derive(Serialize)]
pub struct ImageResult {
    pub filename: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

#[tauri::command]
fn save_image(state: State<'_, AppState>, data_url: String) -> Option<ImageResult> {
    // Parse data URL: data:image/png;base64,...
    let parts: Vec<&str> = data_url.splitn(2, ",").collect();
    if parts.len() != 2 {
        return None;
    }
    let header = parts[0]; // data:image/png;base64
    let b64_data = parts[1];

    let ext = if header.contains("png") {
        "png"
    } else if header.contains("jpeg") || header.contains("jpg") {
        "jpg"
    } else if header.contains("gif") {
        "gif"
    } else if header.contains("webp") {
        "webp"
    } else {
        "png"
    };

    let id = gen_id();
    let filename = format!("{}.{}", id, ext);
    let filepath = state.image_dir.join(&filename);

    match BASE64.decode(b64_data) {
        Ok(bytes) => {
            let _ = fs::write(&filepath, &bytes);
            Some(ImageResult {
                filename,
                data_url,
            })
        }
        Err(_) => None,
    }
}

#[tauri::command]
fn get_image_path(state: State<'_, AppState>, filename: String) -> String {
    state.image_dir.join(filename).to_string_lossy().to_string()
}

#[tauri::command]
fn select_images(
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<ImageResult>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_response = app
        .dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp", "bmp"])
        .blocking_pick_files();

    let mut results = Vec::new();

    if let Some(files) = file_response {
        for file in files {
            if let Some(path) = file.into_path().ok() {
                if let Ok(data) = fs::read(&path) {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("png");
                    let mime = match ext {
                        "jpg" | "jpeg" => "jpeg",
                        other => other,
                    };

                    let b64 = BASE64.encode(&data);
                    let data_url = format!("data:image/{};base64,{}", mime, b64);

                    let id = gen_id();
                    let filename = format!("{}.{}", id, ext);
                    let dest = state.image_dir.join(&filename);
                    let _ = fs::copy(&path, &dest);

                    results.push(ImageResult {
                        filename,
                        data_url,
                    });
                }
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn read_clipboard_image(state: State<'_, AppState>, app: AppHandle) -> Option<ImageResult> {
    use tauri_plugin_clipboard_manager::ClipboardExt;

    if let Ok(image) = app.clipboard().read_image() {
        let rgba_bytes = image.rgba().to_vec();
        let width = image.width();
        let height = image.height();

        // Encode RGBA to PNG
        let mut png_buf = Vec::new();
        {
            let mut encoder = png::Encoder::new(std::io::Cursor::new(&mut png_buf), width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            if let Ok(mut writer) = encoder.write_header() {
                let _ = writer.write_image_data(&rgba_bytes);
            }
        }

        if png_buf.is_empty() {
            return None;
        }

        let b64 = BASE64.encode(&png_buf);
        let data_url = format!("data:image/png;base64,{}", b64);

        let id = gen_id();
        let filename = format!("{}.png", id);
        let filepath = state.image_dir.join(&filename);
        let _ = fs::write(&filepath, &png_buf);

        Some(ImageResult {
            filename,
            data_url,
        })
    } else {
        None
    }
}

// ─── Clipboard ──────────────────────────────────────────────────

#[tauri::command]
fn copy_to_clipboard(app: AppHandle, text: String) -> bool {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    app.clipboard().write_text(text).is_ok()
}

// ─── Theme ──────────────────────────────────────────────────────

#[tauri::command]
fn get_theme(state: State<'_, AppState>) -> String {
    state.data.lock().unwrap().theme.clone()
}

#[tauri::command]
fn set_theme(state: State<'_, AppState>, theme: String) -> String {
    state.data.lock().unwrap().theme = theme.clone();
    state.save();
    theme
}

// ─── Window Controls ────────────────────────────────────────────

#[tauri::command]
fn window_minimize(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
}

#[tauri::command]
fn window_maximize(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_maximized().unwrap_or(false) {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn window_close(app: AppHandle) {
    app.exit(0);
}

// ─── App Setup ──────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let _ = fs::create_dir_all(&app_data_dir);

            let image_dir = app_data_dir.join("images");
            let _ = fs::create_dir_all(&image_dir);

            let data_path = app_data_dir.join("data.json");
            let data = AppState::load(&data_path);

            app.manage(AppState {
                data: Mutex::new(data),
                data_path,
                image_dir,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_folders,
            create_folder,
            rename_folder,
            delete_folder,
            create_prompt,
            update_prompt,
            delete_prompt,
            move_prompt,
            save_image,
            get_image_path,
            select_images,
            read_clipboard_image,
            copy_to_clipboard,
            get_theme,
            set_theme,
            window_minimize,
            window_maximize,
            window_close,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
