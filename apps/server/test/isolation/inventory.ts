import 'reflect-metadata';
import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { SKIP_TENANT } from '../../src/common/decorators/skip-tenant';

// SEC-02: lists every route the running application registers that is scoped to a shop.
// Routes marked SkipTenant (health, and later any platform-level route) are not shop-owned and are left out.
export function listTenantRoutes(app: INestApplication): string[] {
  const discovery = app.get(DiscoveryService);
  const scanner = new MetadataScanner();
  const routes = new Set<string>();

  for (const wrapper of discovery.getControllers()) {
    // Nest types these as any; they are a controller instance and its class, both present for controllers.
    const instance = wrapper.instance as object | null;
    const metatype = wrapper.metatype as object | null;
    if (!instance || !metatype) continue;

    const classPath = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? '';
    const classSkipped = Reflect.getMetadata(SKIP_TENANT, metatype) === true;
    const prototype = Object.getPrototypeOf(instance) as object;

    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[name];
      if (typeof handler !== 'function') continue;

      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) continue;
      if (classSkipped || Reflect.getMetadata(SKIP_TENANT, handler) === true) continue;

      const handlerPath = (Reflect.getMetadata(PATH_METADATA, handler) as string | undefined) ?? '';
      routes.add(`${RequestMethod[method]} ${joinPath(classPath, handlerPath)}`);
    }
  }

  return [...routes].sort();
}

/** Joins a controller path and a handler path into one normalised route, such as "/orders/:id". */
export function joinPath(...parts: string[]): string {
  const joined = parts
    .filter((part) => part.length > 0)
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/^\/?/, '/');
  return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined;
}

export interface RegistryComparison {
  /** Routes that exist in the application but have no isolation case. The suite fails on any. */
  uncovered: string[];
  /** Cases whose route no longer exists. The suite fails on any, so the registry cannot go stale. */
  stale: string[];
}

export function compareWithRegistry(
  routes: readonly string[],
  registry: Readonly<Record<string, string>>,
): RegistryComparison {
  const registered = new Set(Object.keys(registry));
  const present = new Set(routes);
  return {
    uncovered: routes.filter((route) => !registered.has(route)),
    stale: [...registered].filter((key) => !present.has(key)).sort(),
  };
}
