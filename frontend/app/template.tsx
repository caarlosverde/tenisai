"use client";

import { motion } from "framer-motion";

// Solo opacidad: un `filter` o `transform` persistente en <main> crearía un
// bloque contenedor que rompe los elementos `position: fixed` de las páginas.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {children}
    </motion.main>
  );
}
