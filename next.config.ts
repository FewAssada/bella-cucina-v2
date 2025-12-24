// @ts-nocheck

const nextConfig = {
  typescript: {
    // !! สั่งให้ Vercel มองข้าม Error ภาษาไปเลย
    ignoreBuildErrors: true,
  },
  eslint: {
    // !! สั่งให้มองข้ามการตรวจจับ Code Style
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;