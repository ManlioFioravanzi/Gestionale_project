import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("bookingDesktop", {
  platform: process.platform,
});
