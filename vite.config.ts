import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
<<<<<<< HEAD
=======
  base: process.env.GITHUB_PAGES ? "/smol-video2/" : "/",
>>>>>>> 509dade (Initial smol video PWA)
  plugins: [react()],
  worker: {
    format: "es"
  }
});
