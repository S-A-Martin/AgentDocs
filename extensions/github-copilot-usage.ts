import { FooterComponent, readStoredCredential } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const COPILOT_PROVIDER = "github-copilot";
const COPILOT_USER_PATH = "/copilot_internal/user";
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const TURN_REFRESH_MIN_INTERVAL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;

const COPILOT_HEADERS = {
	Accept: "application/json",
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
};

type CopilotQuota = {
	used: number;
	total: number;
	unlimited: boolean;
};

type QuotaStatus = "loading" | "available" | "unavailable";
type FooterSession = ConstructorParameters<typeof FooterComponent>[0];
type FooterDataProvider = ConstructorParameters<typeof FooterComponent>[1];

function createFooterSession(ctx: ExtensionContext): FooterSession {
	const state = {
		get model() {
			return ctx.model;
		},
		get thinkingLevel() {
			return ctx.thinkingLevel;
		},
	};

	// FooterComponent accepts AgentSession internally; these are the render-time
	// projections exposed by ExtensionContext.
	return {
		state,
		sessionManager: ctx.sessionManager,
		getContextUsage: () => ctx.getContextUsage(),
		modelRuntime: {
			isUsingSubscription(provider: string): boolean {
				const model = ctx.model;
				return (
					model?.provider === provider &&
					ctx.modelRegistry.isUsingOAuth(model) &&
					ctx.modelRegistry.getProvider(provider)?.auth.oauth?.isSubscription === true
				);
			},
		},
	} as unknown as FooterSession;
}

function addRightAlignedText(line: string, right: string, width: number): string {
	if (width <= 0) return "";

	const rightWidth = visibleWidth(right);
	if (rightWidth >= width) return truncateToWidth(right, width, "");

	const left = truncateToWidth(line, Math.max(0, width - rightWidth - 2), "");
	const padding = " ".repeat(Math.max(1, width - visibleWidth(left) - rightWidth));
	return `${left}${padding}${right}`;
}

class CopilotFooter extends FooterComponent {
	constructor(
		session: FooterSession,
		footerData: FooterDataProvider,
		private readonly theme: Theme,
		private readonly getQuotaText: () => string,
	) {
		super(session, footerData);
	}

	override render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length > 0) {
			lines[0] = addRightAlignedText(lines[0], this.theme.fg("dim", this.getQuotaText()), width);
		}
		return lines;
	}
}

function asFiniteNumber(value: unknown): number | undefined {
	const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
	return Number.isFinite(number) ? number : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function parseQuota(response: unknown): CopilotQuota {
	const body = asRecord(response);
	const snapshots = asRecord(body?.quota_snapshots);
	const premium = asRecord(snapshots?.premium_interactions);
	if (!premium) {
		throw new Error("premium quota is unavailable");
	}

	const total = asFiniteNumber(premium.entitlement);
	const remaining = asFiniteNumber(premium.remaining) ?? asFiniteNumber(premium.quota_remaining);
	if (premium.unlimited === true || (total !== undefined && total < 0)) {
		return { used: 0, total: 0, unlimited: true };
	}
	if (total === undefined || total <= 0 || remaining === undefined) {
		throw new Error("premium quota has invalid values");
	}

	return {
		used: Math.max(0, total - remaining),
		total,
		unlimited: false,
	};
}

function getEnterpriseBaseUrl(credential: { enterpriseUrl?: unknown } | undefined): string {
	const enterpriseUrl = credential?.enterpriseUrl;
	if (typeof enterpriseUrl !== "string" || !enterpriseUrl) return "https://api.github.com";

	try {
		const value = enterpriseUrl.includes("://") ? enterpriseUrl : `https://${enterpriseUrl}`;
		return `https://api.${new URL(value).hostname}`;
	} catch {
		return "https://api.github.com";
	}
}

function getStoredCopilotCredential() {
	try {
		const credential = readStoredCredential(COPILOT_PROVIDER);
		return credential?.type === "oauth" ? credential : undefined;
	} catch {
		return undefined;
	}
}

async function requestQuota(token: string, baseUrl: string, signal: AbortSignal): Promise<CopilotQuota | undefined> {
	const response = await fetch(`${baseUrl}${COPILOT_USER_PATH}`, {
		headers: {
			...COPILOT_HEADERS,
			Authorization: `Bearer ${token}`,
		},
		signal,
	});

	if (response.status === 401 || response.status === 403 || response.status === 404) return undefined;
	if (!response.ok) {
		throw new Error(`Copilot quota request failed with HTTP ${response.status}`);
	}

	return parseQuota(await response.json());
}

async function fetchQuota(ctx: ExtensionContext, signal: AbortSignal): Promise<CopilotQuota> {
	const stored = getStoredCopilotCredential();
	const baseUrl = getEnterpriseBaseUrl(stored);
	const attemptedTokens = new Set<string>();
	const tryQuota = async (token: unknown, requestBaseUrl: string) => {
		if (typeof token !== "string" || token.length === 0 || attemptedTokens.has(token)) return undefined;
		attemptedTokens.add(token);
		return requestQuota(token, requestBaseUrl, signal);
	};

	for (const token of [stored?.refresh, stored?.access]) {
		const quota = await tryQuota(token, baseUrl);
		if (quota) return quota;
	}

	// Refresh through Pi's auth resolver only after the stored tokens fail. This
	// keeps the normal Pi credential refresh path available without requiring gh.
	try {
		const auth = await ctx.modelRegistry.getProviderAuth(COPILOT_PROVIDER);
		const refreshed = getStoredCopilotCredential();
		const refreshedBaseUrl = getEnterpriseBaseUrl(refreshed);
		for (const token of [refreshed?.refresh, refreshed?.access, auth?.auth.apiKey]) {
			const quota = await tryQuota(token, refreshedBaseUrl);
			if (quota) return quota;
		}
	} catch {
		// Keep auth refresh errors out of the footer.
	}

	throw new Error("GitHub Copilot is not authenticated");
}

function formatCount(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

function formatQuota(quota: CopilotQuota): string {
	if (quota.unlimited) {
		return "Copilot unlimited";
	}
	const percent = (quota.used / quota.total) * 100;
	return `Copilot ${formatCount(quota.used)}/${formatCount(quota.total)} (${percent.toFixed(1)}%)`;
}

function quotaStatusText(status: QuotaStatus, quota: CopilotQuota | undefined): string {
	if (status === "available" && quota) return formatQuota(quota);
	if (status === "loading") return "Copilot: loading...";
	return "Copilot: unavailable";
}

export default function (pi: ExtensionAPI) {
	let quota: CopilotQuota | undefined;
	let quotaStatus: QuotaStatus = "loading";
	let lastAttemptAt = 0;
	let refreshInFlight: Promise<void> | undefined;
	let refreshTimer: ReturnType<typeof setInterval> | undefined;
	let requestController: AbortController | undefined;
	let requestFooterRender: (() => void) | undefined;

	function refreshQuota(ctx: ExtensionContext, minIntervalMs = REFRESH_INTERVAL_MS): void {
		const now = Date.now();
		if (now - lastAttemptAt < minIntervalMs || refreshInFlight) return;

		lastAttemptAt = now;
		const controller = new AbortController();
		requestController = controller;
		const request = (async () => {
			try {
				const nextQuota = await fetchQuota(ctx, AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]));
				quota = nextQuota;
				quotaStatus = "available";
			} catch {
				if (!controller.signal.aborted && !quota) quotaStatus = "unavailable";
			} finally {
				if (requestController === controller) requestController = undefined;
				if (refreshInFlight === request) refreshInFlight = undefined;
				if (controller.signal.aborted) return;

				requestFooterRender?.();
			}
		})();
		refreshInFlight = request;
	}

	const clearRefresh = (): void => {
		if (refreshTimer) clearInterval(refreshTimer);
		refreshTimer = undefined;
		requestController?.abort();
		requestController = undefined;
		refreshInFlight = undefined;
		requestFooterRender = undefined;
	};

	pi.on("session_start", (_event, ctx) => {
		clearRefresh();
		quota = undefined;
		quotaStatus = "loading";
		lastAttemptAt = 0;

		if (ctx.mode !== "tui") return;

		// Extend Pi's built-in footer so its token, context, model, and git display
		// remain owned by Pi while the Copilot quota stays on the first line.
		ctx.ui.setFooter((tui, theme, footerData) => {
			requestFooterRender = () => tui.requestRender();
			return new CopilotFooter(
				createFooterSession(ctx),
				footerData,
				theme,
				() => quotaStatusText(quotaStatus, quota),
			);
		});
		refreshQuota(ctx, 0);
		refreshTimer = setInterval(() => refreshQuota(ctx), REFRESH_INTERVAL_MS);
		if (typeof refreshTimer === "object" && "unref" in refreshTimer) refreshTimer.unref();
	});

	pi.on("turn_end", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		// Redraw immediately so Pi's built-in token/context usage is recalculated.
		// Refresh Copilot quota at most once per minute after a completed turn.
		requestFooterRender?.();
		refreshQuota(ctx, TURN_REFRESH_MIN_INTERVAL_MS);
	});

	pi.on("session_shutdown", (_event, _ctx) => {
		clearRefresh();
	});
}
