import "server-only";
import nodemailer from "nodemailer";
import { configCorreo, type ConfigCorreo } from "@/lib/env";
import type { Mensaje } from "./plantillas";

// Envío por SMTP con Nodemailer: Gmail de la cesta en producción, Mailpit en local y en CI.

export type Correo = {
  /** Lanza ErrorEnvio si no se puede enviar. */
  enviar(para: string, mensaje: Mensaje): Promise<void>;
  /** El correo del administrador: "Responder a" y destino de los avisos. */
  admin: string;
  cerrar(): void;
};

/**
 * Error de envío sin datos personales: los errores de SMTP pueden llevar la dirección
 * del destinatario en el mensaje ("Recipient address rejected: ..."), así que solo se
 * conserva el código.
 */
export class ErrorEnvio extends Error {
  constructor(readonly codigo: string) {
    super(`No se ha podido enviar el correo (código ${codigo})`);
    this.name = "ErrorEnvio";
  }
}

export function crearCorreo(config: ConfigCorreo): Correo {
  // Una conexión para todos los correos de un envío: más rápido que abrir una por correo.
  const transporte = nodemailer.createTransport({
    pool: true,
    maxConnections: 1,
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

  return {
    admin: config.admin,
    async enviar(para, mensaje) {
      try {
        await transporte.sendMail({
          from: { name: "Cesta solidaria", address: config.remitente },
          replyTo: config.admin,
          to: para,
          subject: mensaje.asunto,
          text: mensaje.texto,
          html: mensaje.html,
        });
      } catch (error) {
        const e = error as { code?: string; responseCode?: number };
        throw new ErrorEnvio(e.responseCode ? String(e.responseCode) : (e.code ?? "desconocido"));
      }
    },
    cerrar() {
      transporte.close();
    },
  };
}

/** Abre la conexión SMTP con la configuración del entorno, la usa y la cierra. */
export async function conCorreo<T>(trabajo: (correo: Correo) => Promise<T>): Promise<T> {
  const correo = crearCorreo(configCorreo());
  try {
    return await trabajo(correo);
  } finally {
    correo.cerrar();
  }
}
