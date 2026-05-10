import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@precision/ui", "@precision/auth", "@precision/database", "@precision/i18n"],
};

export default withNextIntl(nextConfig);
