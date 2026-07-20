/**
 * Paging constants, kept in their own module.
 *
 * Both the server query layer and the client table need these. Importing them
 * from the data-access module would drag `next/headers` into the client
 * bundle, which fails the build -- so they live somewhere neither side has to
 * reach through a server-only file to get.
 */
export const PAGE_SIZES = [6, 8, 12, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 8;
