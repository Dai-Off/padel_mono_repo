/**
 * Selección de proveedores de infraestructura por variables de entorno.
 *
 * Objetivo: permitir desplegar el mismo backend en dos contextos sin tocar
 * el código de las rutas:
 *   - "global" (default): Supabase + Mock de pagos. Producción actual intacta.
 *   - "china": Aliyun OSS + pasarelas chinas (WeChat Pay / Alipay).
 *
 * Si no se setea ninguna env, todo queda igual que hoy (Supabase / mock).
 */

export type StorageProvider = 'supabase' | 'oss';
export type PaymentProvider = 'mock' | 'wechatpay' | 'alipay';
export type DeploymentRegion = 'global' | 'china';

function readEnv(name: string): string {
  return (process.env[name] || '').trim().toLowerCase();
}

/** Región lógica de despliegue. No cambia comportamiento por sí sola. */
export function getDeploymentRegion(): DeploymentRegion {
  return readEnv('DEPLOY_REGION') === 'china' ? 'china' : 'global';
}

/** Proveedor de almacenamiento de archivos. Default: Supabase Storage. */
export function getStorageProvider(): StorageProvider {
  const value = readEnv('STORAGE_PROVIDER');
  if (value === 'oss' || value === 'aliyun') return 'oss';
  return 'supabase';
}

/** Proveedor de pagos. Default: mock (cobro en mostrador / simulado). */
export function getPaymentProvider(): PaymentProvider {
  const value = readEnv('PAYMENT_PROVIDER');
  if (value === 'wechatpay' || value === 'wechat') return 'wechatpay';
  if (value === 'alipay') return 'alipay';
  return 'mock';
}
