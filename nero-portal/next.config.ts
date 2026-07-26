import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Saída standalone: necessária para a imagem Docker enxuta (infra da Blite no futuro);
  // inofensiva na Vercel.
  output: "standalone",
};

export default nextConfig;
