import { BadRequestException, Injectable, Logger, Optional } from '@nestjs/common';
import {
  type AdminSettingDto,
  checkSettingsConsistency,
  defaultSettings,
  isSettingKey,
  parseSettingValue,
  type PlatformSettings,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  type SettingDefinition,
  type SettingKey,
  type SettingSource,
} from '@sc/shared';
import { PrismaService } from '../prisma/prisma.service';

/** How long a read is reused before the database is asked again. */
const CACHE_TTL_MS = 30_000;

interface Saved {
  value: number | string;
  updatedAt: Date;
}

/**
 * The business values in effect right now (SETTING_DEFINITIONS in
 * @sc/shared): a value saved in the admin console wins, else the
 * environment variable, else the built-in default.
 *
 * Reads are cached for 30 seconds, so a console change reaches every API
 * instance within that time without a database query on every request; the
 * instance that saved the change sees it at once.
 *
 * Constructed without Prisma (unit tests that build a service by hand), it
 * serves environment values and defaults only.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private cache: { at: number; saved: Map<SettingKey, Saved> } | null = null;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    /** Defaults to process.env; tests pass their own. */
    @Optional() private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  /** Everything in effect now. */
  async all(): Promise<PlatformSettings> {
    const saved = await this.saved();
    const out: Record<string, number | string> = {};
    for (const key of SETTING_KEYS) {
      out[key] = saved.get(key)?.value ?? this.fallback(key).value;
    }
    return out as PlatformSettings;
  }

  async get<K extends SettingKey>(key: K): Promise<PlatformSettings[K]> {
    return (await this.all())[key];
  }

  /** Rows for the console's Settings page. */
  async list(): Promise<AdminSettingDto[]> {
    const saved = await this.saved(true);
    return SETTING_KEYS.map((key) => {
      const def: SettingDefinition = SETTING_DEFINITIONS[key];
      const fallback = this.fallback(key);
      const row = saved.get(key);
      const source: SettingSource = row ? 'console' : fallback.source;
      return {
        key,
        label: def.label,
        help: def.help,
        group: def.group,
        kind: def.kind,
        value: row?.value ?? fallback.value,
        source,
        env: def.env,
        fallbackValue: fallback.value,
        ...('min' in def
          ? { min: def.min, max: def.max }
          : { maxLength: def.maxLength, ...(def.options ? { options: [...def.options] } : {}) }),
        updatedAt: row ? row.updatedAt.toISOString() : null,
      };
    });
  }

  /** Saves a console value, or removes it when `raw` is null. */
  async set(key: string, raw: number | string | null, adminId: string): Promise<AdminSettingDto> {
    if (!isSettingKey(key)) throw new BadRequestException(`Unknown setting: ${key}`);
    if (!this.prisma) throw new Error('SettingsService needs Prisma to save settings');

    let value: number | string | null = null;
    if (raw !== null) {
      const parsed = parseSettingValue(key, raw);
      if (!parsed.ok) throw new BadRequestException(parsed.error);
      value = parsed.value;
    }

    // Check the combination that would be in effect, so a pair like the
    // budget range can never be saved in a state the apps cannot use.
    const next = { ...(await this.all()), [key]: value ?? this.fallback(key).value };
    const problem = checkSettingsConsistency(next);
    if (problem) throw new BadRequestException(problem);

    if (value === null) {
      await this.prisma.platformSetting.deleteMany({ where: { key } });
    } else {
      await this.prisma.platformSetting.upsert({
        where: { key },
        create: { key, value, updatedByAdminId: adminId },
        update: { value, updatedByAdminId: adminId },
      });
    }
    this.cache = null;
    const row = (await this.list()).find((item) => item.key === key);
    if (!row) throw new Error(`Setting ${key} vanished after saving`);
    return row;
  }

  /** The environment value if it is set and valid, else the default. */
  private fallback(key: SettingKey): { value: number | string; source: SettingSource } {
    const def = SETTING_DEFINITIONS[key];
    const raw = this.env[def.env];
    if (raw !== undefined && raw !== '') {
      const parsed = parseSettingValue(key, raw);
      if (parsed.ok) return { value: parsed.value, source: 'environment' };
      this.logger.warn(`Ignoring ${def.env}: ${parsed.error}`);
    }
    return { value: defaultSettings()[key], source: 'default' };
  }

  private async saved(fresh = false): Promise<Map<SettingKey, Saved>> {
    if (!this.prisma) return new Map();
    if (!fresh && this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.saved;

    const rows = await this.prisma.platformSetting.findMany();
    const saved = new Map<SettingKey, Saved>();
    for (const row of rows) {
      if (!isSettingKey(row.key)) continue; // a setting removed from the code
      const parsed = parseSettingValue(row.key, row.value);
      if (!parsed.ok) {
        // A saved value that later falls outside a tightened range must not
        // take effect; the console still shows the fallback in use.
        this.logger.warn(`Ignoring saved ${row.key}: ${parsed.error}`);
        continue;
      }
      saved.set(row.key, { value: parsed.value, updatedAt: row.updatedAt });
    }
    this.cache = { at: Date.now(), saved };
    return saved;
  }
}

/**
 * For helpers that take Prisma directly rather than through dependency
 * injection. Each call reads the database once; use the injected service on
 * hot paths.
 */
export function settingsFor(prisma: PrismaService): SettingsService {
  return new SettingsService(prisma);
}
