"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { identidade } from "@/config/identidade";
import { menu } from "@/config/menu";

export function Cabecalho() {
  const caminho = usePathname();
  return (
    <header
      className="sticky top-0 z-10 text-white shadow"
      style={{ background: "var(--cor-principal)", borderBottom: "4px solid rgba(0,0,0,0.15)" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        {identidade.logo ? (
          <Image
            src={identidade.logo}
            alt={identidade.nome}
            width={48}
            height={48}
            priority
            className="h-12 w-12 rounded-full border-2 border-white/70 bg-[#fffaf2] object-contain p-1 shadow-sm"
          />
        ) : null}
        <span className="titulo-rustico text-xl font-bold leading-tight">{identidade.nome}</span>
      </div>
      <nav className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-2 pb-2">
        {menu.map((item) => {
          const ativo = caminho === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${
                ativo ? "bg-white/20" : "hover:bg-white/10"
              }`}
            >
              {item.rotulo}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
