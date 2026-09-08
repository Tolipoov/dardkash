import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker konteyneri uchun eng kichik, mustaqil build — node_modules'ning
  // faqat kerakli qismini o'z ichiga oladi, image hajmini kamaytiradi.
  output: 'standalone',

  // Production'da nginx bitta domenda frontend va backend (/api/)ni
  // birlashtiradi (deploy/dardkash.uz.conf), shuning uchun frontend
  // kodi hamma joyda nisbiy "/api/..." yo'l bilan so'rov yuboradi.
  // Lekin lokal ishga tushirishda (Docker'siz "npm run dev", yoki hatto
  // docker-compose'ning o'zi — ikkalasida ham nginx yo'q) frontend va
  // backend ALOHIDA portlarda turadi, shuning uchun "/api/..." Next.js
  // serverining o'ziga tushib, 404 qaytarardi. NEXT_PUBLIC_API_ORIGIN
  // (.env'da, masalan http://localhost:4000) berilgan bo'lsa, shu manzilga
  // qayta yo'naltiramiz — production'da (nginx bor joyda) bu o'zgaruvchi
  // bo'sh qoladi va rewrite hech narsaga ta'sir qilmaydi.
  async rewrites() {
    const apiOrigin = process.env.NEXT_PUBLIC_API_ORIGIN;
    if (!apiOrigin) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
