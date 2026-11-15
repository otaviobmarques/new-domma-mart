import { DEFAULT_FEE_TABLE, DEFAULT_RELEASE_SETTINGS, type FeeTable, type ReleaseSettings } from "@domma/core";
import type { Tx } from "@domma/db";

export interface PlatformSettings {
  version: number;
  fees: FeeTable;
  release: ReleaseSettings;
  pixKeyChangeBlockHours: number;
  pixExpiresMinutes: number;
  prohibitedCategories: string[];
}

/** Configuração em vigor: a versão publicada mais recente (tela B05). */
export async function getPlatformSettings(tx: Tx): Promise<PlatformSettings> {
  const [row] = await tx`select version, data from platform_settings where published_at is not null order by version desc limit 1`;
  const data = (row?.data ?? {}) as Partial<PlatformSettings>;
  return {
    version: row?.version ?? 0,
    fees: { ...DEFAULT_FEE_TABLE, ...data.fees },
    release: { ...DEFAULT_RELEASE_SETTINGS, ...data.release },
    pixKeyChangeBlockHours: data.pixKeyChangeBlockHours ?? 24,
    pixExpiresMinutes: data.pixExpiresMinutes ?? 15,
    prohibitedCategories: data.prohibitedCategories ?? [],
  };
}
