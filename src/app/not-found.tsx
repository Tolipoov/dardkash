// Til segmenti noto'g'ri bo'lgan manzillar uchun (masalan /wp-login.php,
// /abc.txt). Root layout <html> chizmaydi ([locale]/layout chizadi),
// shuning uchun bu sahifa o'zi to'liq hujjat bo'lishi kerak.
export default function NotFound() {
  return (
    <html lang="uz">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          fontFamily: "system-ui, sans-serif",
          background: "#EDEAE2",
          color: "#2A2924",
        }}
      >
        <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
        <p style={{ margin: 0 }}>Sahifa topilmadi · Страница не найдена</p>
        <a href="/" style={{ color: "inherit" }}>
          dardkash.uz
        </a>
      </body>
    </html>
  );
}
