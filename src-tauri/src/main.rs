// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{RunEvent, WindowEvent};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

struct BackendState {
    #[allow(dead_code)]
    child: Arc<Mutex<Option<Child>>>,
}

fn find_project_root() -> PathBuf {
    // 1. Tentar diretório atual de trabalho
    if let Ok(curr) = std::env::current_dir() {
        if curr.join("src").join("index.js").exists() {
            return curr;
        }
        if let Some(parent) = curr.parent() {
            if parent.join("src").join("index.js").exists() {
                return parent.to_path_buf();
            }
        }
    }

    // 2. Tentar diretório onde o executável reside
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if dir.join("src").join("index.js").exists() {
                return dir.to_path_buf();
            }
            if let Some(p1) = dir.parent() {
                if p1.join("src").join("index.js").exists() {
                    return p1.to_path_buf();
                }
                if let Some(p2) = p1.parent() {
                    if p2.join("src").join("index.js").exists() {
                        return p2.to_path_buf();
                    }
                }
            }
        }
    }

    // Fallback: diretório atual
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn find_node_executable() -> String {
    let candidates = [
        "node".to_string(),
        "C:\\Program Files\\nodejs\\node.exe".to_string(),
        "C:\\Program Files (x86)\\nodejs\\node.exe".to_string(),
    ];

    for candidate in &candidates {
        if candidate == "node" {
            let mut check_cmd = Command::new("node");
            #[cfg(windows)]
            check_cmd.creation_flags(CREATE_NO_WINDOW);

            if let Ok(output) = check_cmd.arg("-v").output() {
                if output.status.success() {
                    return "node".to_string();
                }
            }
        } else if Path::new(candidate).exists() {
            return candidate.clone();
        }
    }

    "node".to_string()
}

fn start_backend() -> Option<Child> {
    let root_dir = find_project_root();
    let script_path = root_dir.join("src").join("index.js");

    if !script_path.exists() {
        eprintln!("[RadarXL] Script de backend não encontrado em: {:?}", script_path);
        return None;
    }

    let node_bin = find_node_executable();
    println!("[RadarXL] Inicializando backend Node.js em: {:?}", root_dir);

    // Garante que qualquer processo antigo na porta 3000 seja reciclado
    #[cfg(windows)]
    {
        let mut kill_cmd = Command::new("powershell");
        kill_cmd.creation_flags(CREATE_NO_WINDOW);
        kill_cmd.args(&["-NoProfile", "-Command", "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"]);
        let _ = kill_cmd.output();
    }

    let mut cmd = Command::new(&node_bin);
    cmd.current_dir(&root_dir);
    cmd.arg("src/index.js");
    cmd.env("HOST", "127.0.0.1");
    cmd.env("PORT", "3000");

    // Oculta completamente a janela de console do Windows (sem prompt na tela)
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);

    match cmd.spawn() {
        Ok(child) => {
            println!("[RadarXL] Backend Node.js iniciado com PID: {}", child.id());
            Some(child)
        }
        Err(err) => {
            eprintln!("[RadarXL] Erro ao iniciar backend Node.js: {}", err);
            None
        }
    }
}

fn stop_backend(child_mutex: &Arc<Mutex<Option<Child>>>) {
    if let Ok(mut lock) = child_mutex.lock() {
        if let Some(mut child) = lock.take() {
            println!("[RadarXL] Encerrando backend Node.js (PID: {})...", child.id());
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
fn get_radarxl_status() -> String {
    "RadarXL 2.0 Engine Online".to_string()
}

fn main() {
    let backend_child = Arc::new(Mutex::new(start_backend()));
    let child_for_state = Arc::clone(&backend_child);
    let child_for_window = Arc::clone(&backend_child);
    let child_for_exit = Arc::clone(&backend_child);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                if let Ok(updater) = handle.updater() {
                    match updater.check().await {
                        Ok(Some(update)) => {
                            println!("[RadarXL Updater] Nova versão encontrada: {}", update.version);
                            let mut downloaded: u64 = 0;
                            let install_res = update.download_and_install(|chunk_length, content_length| {
                                downloaded += chunk_length as u64;
                                if let Some(total) = content_length {
                                    if total > 0 {
                                        println!("[RadarXL Updater] Baixando: {}% ({}/{})", (downloaded * 100) / total, downloaded, total);
                                    }
                                }
                            }, || {
                                println!("[RadarXL Updater] Download concluído! Aplicando atualização...");
                            }).await;

                            match install_res {
                                Ok(()) => println!("[RadarXL Updater] Atualização instalada com sucesso! Reinicie o aplicativo."),
                                Err(e) => eprintln!("[RadarXL Updater] Erro ao instalar atualização: {}", e),
                            }
                        }
                        Ok(None) => {
                            println!("[RadarXL Updater] Aplicativo atualizado na versão mais recente.");
                        }
                        Err(e) => {
                            eprintln!("[RadarXL Updater] Verificação de atualização: {}", e);
                        }
                    }
                }
            });
            Ok(())
        })
        .manage(BackendState { child: child_for_state })
        .invoke_handler(tauri::generate_handler![get_radarxl_status])
        .on_window_event(move |_window, event| {
            if let WindowEvent::CloseRequested { .. } = event {
                stop_backend(&child_for_window);
            }
        })
        .build(tauri::generate_context!())
        .expect("Erro ao inicializar o aplicativo RadarXL");

    app.run(move |_app_handle, event| {
        if let RunEvent::Exit = event {
            stop_backend(&child_for_exit);
        }
    });
}
