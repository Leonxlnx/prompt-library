use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Listener, Manager, State, WebviewUrl, WebviewWindowBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{Menu, MenuItem};
use uuid::Uuid;

// ─── Data Models ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Prompt {
    pub id: String,
    pub name: String,
    pub text: String,
    pub tags: Vec<String>,
    pub images: Vec<String>,
    #[serde(alias = "createdAt", rename(serialize = "created_at", deserialize = "created_at"))]
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub prompts: Vec<Prompt>,
    #[serde(default)]
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub folders: Vec<Folder>,
    pub theme: String,
    #[serde(default = "default_shortcut")]
    pub shortcut: String,
    #[serde(default)]
    pub sidebar_background: String,
    #[serde(default)]
    pub main_background: String,
    #[serde(default = "default_glass_mode")]
    pub glass_mode: String,
    #[serde(default = "default_surface_opacity")]
    pub surface_opacity: f32,
    #[serde(default = "default_surface_brightness")]
    pub surface_brightness: f32,
    #[serde(default = "default_card_opacity")]
    pub card_opacity: f32,
    #[serde(default = "default_glass_blur")]
    pub glass_blur: f32,
    #[serde(default = "default_background_visibility")]
    pub background_visibility: f32,
    #[serde(default = "default_accent_color")]
    pub accent_color: String,
    #[serde(default)]
    pub fit_cards_to_window: bool,
}

fn default_shortcut() -> String {
    "CommandOrControl+Shift+S".into()
}

fn default_glass_mode() -> String {
    "apple".into()
}

fn default_surface_opacity() -> f32 {
    0.82
}

fn default_surface_brightness() -> f32 {
    1.0
}

fn default_card_opacity() -> f32 {
    0.78
}

fn default_glass_blur() -> f32 {
    14.0
}

fn default_background_visibility() -> f32 {
    0.24
}

fn default_accent_color() -> String {
    "#79BFFF".into()
}

fn normalize_accent_color(value: &str) -> String {
    let trimmed = value.trim();
    let hex = trimmed.strip_prefix('#').unwrap_or(trimmed);
    if hex.len() == 6 && hex.chars().all(|c| c.is_ascii_hexdigit()) {
        format!("#{}", hex.to_uppercase())
    } else {
        default_accent_color()
    }
}

impl Default for AppData {
    fn default() -> Self {
        AppData {
            folders: vec![
                Folder {
                    id: "default".into(),
                    name: "General".into(),
                    color: String::new(),
                    prompts: vec![
                        Prompt {
                            id: "welcome".into(),
                            name: "Welcome Prompt".into(),
                            text: "You are a helpful AI assistant. Please answer my questions clearly and concisely.".into(),
                            tags: vec!["general".into(), "starter".into()],
                            images: vec![],
                            created_at: chrono_now(),
                            favorite: false,
                        },
                        Prompt {
                            id: "code-review".into(),
                            name: "Code Review".into(),
                            text: "Please review the following code for bugs, performance issues, and best practices. Provide specific suggestions for improvement.".into(),
                            tags: vec!["coding".into(), "review".into()],
                            images: vec![],
                            created_at: chrono_now(),
                            favorite: false,
                        },
                    ],
                },
                Folder {
                    id: "creative".into(),
                    name: "Creative Writing".into(),
                    color: String::new(),
                    prompts: vec![Prompt {
                        id: "storyteller".into(),
                        name: "Story Generator".into(),
                        text: "Write a compelling short story based on the following premise. Include vivid descriptions, engaging dialogue, and a surprising twist.".into(),
                        tags: vec!["creative".into(), "writing".into()],
                        images: vec![],
                        created_at: chrono_now(),
                        favorite: false,
                    }],
                },
            ],
            theme: "dark".into(),
            shortcut: default_shortcut(),
            sidebar_background: String::new(),
            main_background: String::new(),
            glass_mode: default_glass_mode(),
            surface_opacity: default_surface_opacity(),
            surface_brightness: default_surface_brightness(),
            card_opacity: default_card_opacity(),
            glass_blur: default_glass_blur(),
            background_visibility: default_background_visibility(),
            accent_color: default_accent_color(),
            fit_cards_to_window: false,
        }
    }
}

fn chrono_now() -> String {
    now_iso()
}

fn gen_id() -> String {
    Uuid::new_v4().to_string()[..12].to_string()
}

fn now_iso() -> String {
    let d = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let total_secs = d.as_secs();
    
    // Calculate actual date from epoch seconds
    let secs_per_day: u64 = 86400;
    let mut remaining_days = (total_secs / secs_per_day) as i64;
    let time_secs = total_secs % secs_per_day;
    let hours = time_secs / 3600;
    let minutes = (time_secs % 3600) / 60;
    let seconds = time_secs % 60;
    
    // Start from 1970-01-01
    let mut year: i64 = 1970;
    loop {
        let days_in_year = if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 { 366 } else { 365 };
        if remaining_days < days_in_year {
            break;
        }
        remaining_days -= days_in_year;
        year += 1;
    }
    
    let is_leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days_in_months = [31, if is_leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month: usize = 0;
    for (i, &dim) in days_in_months.iter().enumerate() {
        if remaining_days < dim as i64 {
            month = i;
            break;
        }
        remaining_days -= dim as i64;
    }
    let day = remaining_days + 1;
    
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month + 1, day, hours, minutes, seconds
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
        color: String::new(),
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
            favorite: false,
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

// ─── Settings Commands ──────────────────────────────────────────

#[derive(Serialize)]
pub struct Settings {
    pub shortcut: String,
    pub theme: String,
    pub sidebar_background: String,
    pub main_background: String,
    pub glass_mode: String,
    pub surface_opacity: f32,
    pub surface_brightness: f32,
    pub card_opacity: f32,
    pub glass_blur: f32,
    pub background_visibility: f32,
    pub accent_color: String,
    pub fit_cards_to_window: bool,
}

fn snapshot_settings(data: &AppData) -> Settings {
    Settings {
        shortcut: data.shortcut.clone(),
        theme: data.theme.clone(),
        sidebar_background: data.sidebar_background.clone(),
        main_background: data.main_background.clone(),
        glass_mode: data.glass_mode.clone(),
        surface_opacity: data.surface_opacity,
        surface_brightness: data.surface_brightness,
        card_opacity: data.card_opacity,
        glass_blur: data.glass_blur,
        background_visibility: data.background_visibility,
        accent_color: data.accent_color.clone(),
        fit_cards_to_window: data.fit_cards_to_window,
    }
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> Settings {
    let data = state.data.lock().unwrap();
    snapshot_settings(&data)
}

#[tauri::command]
fn set_shortcut(state: State<'_, AppState>, app: AppHandle, shortcut: String) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // Unregister all existing shortcuts
    let _ = app.global_shortcut().unregister_all();

    // Register the new shortcut
    let app_handle = app.clone();
    let parsed: tauri_plugin_global_shortcut::Shortcut = shortcut.parse().map_err(|e| format!("{:?}", e))?;
    app.global_shortcut()
        .on_shortcut(parsed, move |_app, _shortcut, event| {
            if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                // Emit event instead of directly creating window to avoid deadlock
                let _ = app_handle.emit("open-quicksave", ());
            }
        })
        .map_err(|e| e.to_string())?;

    // Save to data
    state.data.lock().unwrap().shortcut = shortcut;
    state.save();
    Ok(())
}

#[tauri::command]
fn set_background_image(state: State<'_, AppState>, area: String, filename: String) -> Settings {
    let settings = {
        let mut data = state.data.lock().unwrap();
        match area.as_str() {
            "sidebar" => data.sidebar_background = filename,
            "main" => data.main_background = filename,
            _ => {}
        }
        snapshot_settings(&data)
    };
    state.save();
    settings
}

#[tauri::command]
fn set_glass_settings(
    state: State<'_, AppState>,
    _glass_mode: String,
    surface_opacity: f32,
    surface_brightness: f32,
    card_opacity: f32,
    glass_blur: f32,
    background_visibility: f32,
    accent_color: String,
) -> Settings {
    let settings = {
        let mut data = state.data.lock().unwrap();
        data.glass_mode = "apple".into();
        data.surface_opacity = surface_opacity.clamp(0.08, 0.98);
        data.surface_brightness = surface_brightness.clamp(0.72, 1.38);
        data.card_opacity = card_opacity.clamp(0.18, 0.96);
        data.glass_blur = glass_blur.clamp(6.0, 26.0);
        data.background_visibility = background_visibility.clamp(0.0, 1.0);
        data.accent_color = normalize_accent_color(&accent_color);
        snapshot_settings(&data)
    };
    state.save();
    settings
}

#[tauri::command]
fn set_appearance_settings(
    state: State<'_, AppState>,
    _glass_mode: String,
    surface_opacity: f32,
    surface_brightness: f32,
    card_opacity: f32,
    glass_blur: f32,
    background_visibility: f32,
    accent_color: String,
    background_filename: String,
    fit_cards_to_window: bool,
) -> Settings {
    let settings = {
        let mut data = state.data.lock().unwrap();
        data.glass_mode = "apple".into();
        data.surface_opacity = surface_opacity.clamp(0.08, 0.98);
        data.surface_brightness = surface_brightness.clamp(0.72, 1.38);
        data.card_opacity = card_opacity.clamp(0.18, 0.96);
        data.glass_blur = glass_blur.clamp(6.0, 26.0);
        data.background_visibility = background_visibility.clamp(0.0, 1.0);
        data.accent_color = normalize_accent_color(&accent_color);
        data.main_background = background_filename.clone();
        data.sidebar_background = background_filename;
        data.fit_cards_to_window = fit_cards_to_window;
        snapshot_settings(&data)
    };
    state.save();
    settings
}

#[tauri::command]
fn close_quicksave(app: AppHandle) {
    // Notify the main window to refresh its data
    let _ = app.emit("folders-changed", ());
    if let Some(window) = app.get_webview_window("quicksave") {
        let _ = window.close();
    }
}

fn open_quicksave_window(app: &AppHandle) {
    // If already open, just focus it
    if let Some(window) = app.get_webview_window("quicksave") {
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }

    let build_quicksave = || {
        WebviewWindowBuilder::new(
            app,
            "quicksave",
            WebviewUrl::App("quicksave.html".into()),
        )
        .title("Quick Save")
        .inner_size(460.0, 520.0)
        .resizable(false)
        .decorations(false)
        .skip_taskbar(true)
        .always_on_top(true)
        .center()
    };

    let builder = if let Some(icon) = app.default_window_icon().cloned() {
        match build_quicksave().icon(icon) {
            Ok(builder) => builder,
            Err(_) => build_quicksave(),
        }
    } else {
        build_quicksave()
    };

    let _ = builder.build();
}

// ─── Organisation Commands ──────────────────────────────────────

#[tauri::command]
fn toggle_favorite(
    state: State<'_, AppState>,
    folder_id: String,
    prompt_id: String,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    if let Some(folder) = data.folders.iter_mut().find(|f| f.id == folder_id) {
        if let Some(prompt) = folder.prompts.iter_mut().find(|p| p.id == prompt_id) {
            prompt.favorite = !prompt.favorite;
        }
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn set_folder_color(
    state: State<'_, AppState>,
    id: String,
    color: String,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    if let Some(folder) = data.folders.iter_mut().find(|f| f.id == id) {
        folder.color = color;
    }
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
}

#[tauri::command]
fn reorder_folders(
    state: State<'_, AppState>,
    folder_ids: Vec<String>,
) -> Vec<Folder> {
    let mut data = state.data.lock().unwrap();
    let mut reordered: Vec<Folder> = Vec::new();
    for id in &folder_ids {
        if let Some(pos) = data.folders.iter().position(|f| &f.id == id) {
            reordered.push(data.folders.remove(pos));
        }
    }
    // Append any remaining folders not in the list
    reordered.append(&mut data.folders);
    data.folders = reordered;
    drop(data);
    state.save();
    state.data.lock().unwrap().folders.clone()
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
    // Hide to tray instead of quitting
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

#[tauri::command]
fn app_quit(app: AppHandle) {
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
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().expect("Failed to get app data dir");
            let _ = fs::create_dir_all(&app_data_dir);

            let image_dir = app_data_dir.join("images");
            let _ = fs::create_dir_all(&image_dir);

            let data_path = app_data_dir.join("data.json");
            let data = AppState::load(&data_path);

            let shortcut_str = data.shortcut.clone();

            app.manage(AppState {
                data: Mutex::new(data),
                data_path,
                image_dir,
            });

            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = app.default_window_icon().cloned() {
                    let _ = window.set_icon(icon);
                }
            }

            // ─── System Tray ───
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Prompt Library")
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ─── Global Shortcut ───
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            let app_handle = app.handle().clone();
            if let Ok(shortcut) = shortcut_str.parse::<tauri_plugin_global_shortcut::Shortcut>() {
                let _ = app.global_shortcut().on_shortcut(shortcut, move |_app, _shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        // Emit event instead of directly creating window to avoid deadlock
                        let _ = app_handle.emit("open-quicksave", ());
                    }
                });
            }

            // Listen for the quicksave event on the main thread
            let app_handle2 = app.handle().clone();
            app.listen("open-quicksave", move |_event| {
                open_quicksave_window(&app_handle2);
            });

            // ─── Autostart: enable and hide on boot ───
            use tauri_plugin_autostart::ManagerExt;
            let autostart_manager = app.autolaunch();
            let _ = autostart_manager.enable();

            // If launched with --autostart flag, hide the main window
            let args: Vec<String> = std::env::args().collect();
            if args.iter().any(|a| a == "--autostart") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

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
            toggle_favorite,
            set_folder_color,
            reorder_folders,
            save_image,
            get_image_path,
            select_images,
            read_clipboard_image,
            copy_to_clipboard,
            get_theme,
            set_theme,
            get_settings,
            set_shortcut,
            set_background_image,
            set_glass_settings,
            set_appearance_settings,
            close_quicksave,
            window_minimize,
            window_maximize,
            window_close,
            app_quit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
