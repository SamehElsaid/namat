"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RegisterDeviceAliasPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/account/install");
  }, [router]);
  return null;
}
