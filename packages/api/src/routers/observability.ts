import { router, protectedProcedure } from '../trpc';

/**
 * Observabilidad — lee métricas AGREGADAS de Sentry para mostrarlas dentro de
 * admin (sección Agentes IA). Diseño HIPAA-safe (Opción A): solo conteos,
 * salud y metadata de issues — NUNCA el payload crudo de un evento, para que
 * admin se mantenga fuera de alcance PHI cuando las apps clínicas se conecten.
 */

const SENTRY_API = 'https://sentry.io/api/0';

// Proyectos ZERO-PHI que mostramos hoy. Los clínicos se suman tras el BAA.
const PROJECTS: Array<{ slug: string; label: string }> = [
  { slug: 'phoenix-admin', label: 'Admin' },
  { slug: 'phoenix-timeclock', label: 'Timeclock' },
];

const ISSUE_LIMIT = 25;

export interface SentryIssue {
  shortId: string;
  title: string;
  culprit: string | null;
  level: string;
  count: number;
  userCount: number;
  lastSeen: string;
  permalink: string;
}

export interface SentryProjectHealth {
  slug: string;
  label: string;
  ok: boolean;
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  unresolvedCount: number;
  capped: boolean;
  totalEvents: number;
  issues: SentryIssue[];
  error?: string;
}

export interface SentryHealth {
  configured: boolean;
  org: string;
  projects: SentryProjectHealth[];
}

async function fetchProjectIssues(
  org: string,
  token: string,
  project: { slug: string; label: string },
): Promise<SentryProjectHealth> {
  const url =
    `${SENTRY_API}/projects/${org}/${project.slug}/issues/` +
    `?query=is:unresolved&statsPeriod=14d&limit=${ISSUE_LIMIT}&sort=freq`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        slug: project.slug,
        label: project.label,
        ok: false,
        status: 'unknown',
        unresolvedCount: 0,
        capped: false,
        totalEvents: 0,
        issues: [],
        error: `Sentry API ${res.status}`,
      };
    }

    const raw = (await res.json()) as Array<{
      shortId: string;
      title?: string;
      metadata?: { value?: string; type?: string };
      culprit?: string | null;
      level?: string;
      count?: string | number;
      userCount?: number;
      lastSeen?: string;
      permalink?: string;
    }>;

    const issues: SentryIssue[] = raw.map((i) => ({
      shortId: i.shortId,
      title: i.title ?? i.metadata?.value ?? i.metadata?.type ?? 'Error',
      culprit: i.culprit ?? null,
      level: i.level ?? 'error',
      count: Number(i.count ?? 0),
      userCount: i.userCount ?? 0,
      lastSeen: i.lastSeen ?? '',
      permalink: i.permalink ?? '',
    }));

    const totalEvents = issues.reduce((sum, i) => sum + i.count, 0);
    const unresolvedCount = issues.length;

    return {
      slug: project.slug,
      label: project.label,
      ok: true,
      status: unresolvedCount === 0 ? 'healthy' : 'warning',
      unresolvedCount,
      capped: unresolvedCount >= ISSUE_LIMIT,
      totalEvents,
      issues,
    };
  } catch (err) {
    return {
      slug: project.slug,
      label: project.label,
      ok: false,
      status: 'unknown',
      unresolvedCount: 0,
      capped: false,
      totalEvents: 0,
      issues: [],
      error: err instanceof Error ? err.message : 'fetch failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const observabilityRouter = router({
  getHealth: protectedProcedure.query(async (): Promise<SentryHealth> => {
    const token = process.env.SENTRY_API_TOKEN;
    const org = process.env.SENTRY_ORG ?? 'precision-medical';

    if (!token) {
      return { configured: false, org, projects: [] };
    }

    const projects = await Promise.all(
      PROJECTS.map((p) => fetchProjectIssues(org, token, p)),
    );

    return { configured: true, org, projects };
  }),
});
