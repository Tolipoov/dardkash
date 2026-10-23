import type { MetadataRoute } from "next";

// "Bosh ekranga qo'shish" uchun — iPhone'da brauzer push-bildirishnomalari
// faqat shu tarzda o'rnatilgan saytda ishlaydi.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dardkash",
    short_name: "Dardkash",
    description: "Sizni hukm qilmasdan tinglaydigan inson bilan suhbat",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F4F0E6",
    theme_color: "#5F7D5A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
