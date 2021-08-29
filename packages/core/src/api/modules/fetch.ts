import type { PendingQueryItem } from '@cyberalien/redundancy';
import type {
	APIQueryParams,
	IconifyAPIPrepareQuery,
	IconifyAPISendQuery,
	IconifyAPIModule,
	GetIconifyAPIModule,
} from '../modules';
import type { GetAPIConfig } from '../config';

/**
 * Endpoint
 */
const endPoint = '{prefix}.json?icons={icons}';

/**
 * Cache
 */
const maxLengthCache: Record<string, number> = Object.create(null);
const pathCache: Record<string, string> = Object.create(null);

/**
 * Get fetch function
 */
type FetchType = typeof fetch;
const detectFetch = (): FetchType | null => {
	let callback;

	// Try global fetch
	try {
		callback = fetch;
		if (typeof callback === 'function') {
			return callback;
		}
	} catch (err) {
		//
	}

	// Try cross-fetch
	try {
		// Obfuscate require() to avoid cross-fetch being bundled by Webpack
		const chunk = String.fromCharCode(114) + String.fromCharCode(101);
		const req = (this as unknown as Record<string, FetchType>)[
			chunk + 'qui' + chunk
		];
		callback = req('cross-fetch');
		if (typeof callback === 'function') {
			return callback;
		}
	} catch (err) {
		//
	}

	return null;
};

/**
 * Fetch function
 */
let fetchModule: FetchType | null = detectFetch();

/**
 * Set custom fetch() function
 */
export function setFetch(fetch: unknown): void {
	fetchModule = fetch as FetchType;
}

/**
 * Get fetch() function. Used by Icon Finder Core
 */
export function getFetch(): typeof fetchModule {
	return fetchModule;
}

/**
 * Return API module
 */
export const getAPIModule: GetIconifyAPIModule = (
	getAPIConfig: GetAPIConfig
): IconifyAPIModule => {
	/**
	 * Calculate maximum icons list length for prefix
	 */
	function calculateMaxLength(provider: string, prefix: string): number {
		// Get config and store path
		const config = getAPIConfig(provider);
		if (!config) {
			return 0;
		}

		// Calculate
		let result;
		if (!config.maxURL) {
			result = 0;
		} else {
			let maxHostLength = 0;
			config.resources.forEach((item) => {
				const host = item as string;
				maxHostLength = Math.max(maxHostLength, host.length);
			});

			// Get available length
			result =
				config.maxURL -
				maxHostLength -
				config.path.length -
				endPoint
					.replace('{provider}', provider)
					.replace('{prefix}', prefix)
					.replace('{icons}', '').length;
		}

		// Cache stuff and return result
		const cacheKey = provider + ':' + prefix;
		pathCache[cacheKey] = config.path;
		maxLengthCache[cacheKey] = result;
		return result;
	}

	/**
	 * Prepare params
	 */
	const prepare: IconifyAPIPrepareQuery = (
		provider: string,
		prefix: string,
		icons: string[]
	): APIQueryParams[] => {
		const results: APIQueryParams[] = [];

		// Get maximum icons list length
		let maxLength = maxLengthCache[prefix];
		if (maxLength === void 0) {
			maxLength = calculateMaxLength(provider, prefix);
		}

		// Split icons
		let item: APIQueryParams = {
			provider,
			prefix,
			icons: [],
		};
		let length = 0;
		icons.forEach((name, index) => {
			length += name.length + 1;
			if (length >= maxLength && index > 0) {
				// Next set
				results.push(item);
				item = {
					provider,
					prefix,
					icons: [],
				};
				length = name.length;
			}

			item.icons.push(name);
		});
		results.push(item);

		return results;
	};

	/**
	 * Load icons
	 */
	const send: IconifyAPISendQuery = (
		host: string,
		params: APIQueryParams,
		status: PendingQueryItem
	): void => {
		const provider = params.provider;
		const prefix = params.prefix;
		const icons = params.icons;
		const iconsList = icons.join(',');

		const cacheKey = provider + ':' + prefix;
		const path =
			pathCache[cacheKey] +
			endPoint
				.replace('{provider}', provider)
				.replace('{prefix}', prefix)
				.replace('{icons}', iconsList);

		if (!fetchModule) {
			// Fail: return 424 Failed Dependency (its not meant to be used like that, but it is the best match)
			status.done(void 0, 424);
			return;
		}

		// console.log('API query:', host + path);
		fetchModule(host + path)
			.then((response) => {
				if (response.status !== 200) {
					status.done(void 0, response.status);
					return;
				}

				return response.json();
			})
			.then((data) => {
				if (typeof data !== 'object' || data === null) {
					return;
				}

				// Store cache and complete
				status.done(data);
			})
			.catch((err) => {
				// Error
				status.done(void 0, err.errno);
			});
	};

	// Return functions
	return {
		prepare,
		send,
	};
};
