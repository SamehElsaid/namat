"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function DesignMotion() {
  const pathname = usePathname();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const nodes = document.querySelectorAll(".headingrow,.step,.restore,.faq > div,footer");
    if (reduced.matches || !("IntersectionObserver" in window)) return;

    document.documentElement.classList.add("motion-ready");
    nodes.forEach((node) => {
      node.classList.add("reveal");
      if (node.classList.contains("step") && node.parentElement) {
        const index = Array.from(node.parentElement.children).indexOf(node);
        (node as HTMLElement).style.setProperty("--reveal-delay", `${index * 90}ms`);
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    nodes.forEach((node) => observer.observe(node));

    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      document.documentElement.classList.remove("motion-ready");
      observer.disconnect();
    };
    reduced.addEventListener("change", onChange);
    return () => {
      reduced.removeEventListener("change", onChange);
      observer.disconnect();
      document.documentElement.classList.remove("motion-ready");
      nodes.forEach((node) => {
        node.classList.remove("reveal", "is-visible");
      });
    };
  }, [pathname]);

  return null;
}
