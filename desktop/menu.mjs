import { Menu, shell } from "electron";
import path from "node:path";

export function installDesktopMenu({ dataDir } = {}) {
  const template = [
    {
      label: "AI Creator OS",
      submenu: [
        {
          label: "打开数据目录",
          click: () => {
            if (dataDir) shell.openPath(dataDir);
          }
        },
        {
          label: "打开日志目录",
          click: () => {
            if (dataDir) shell.openPath(path.join(dataDir, "logs"));
          }
        },
        { type: "separator" },
        { role: "quit", label: "退出" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "刷新" },
        { role: "toggleDevTools", label: "开发者工具" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
