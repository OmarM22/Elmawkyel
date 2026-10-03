/*
 * Data-store dispatcher.
 *
 * Routes and auth import from here — never from ./demo or ./dbstore directly.
 * - USE_DEMO_DATA=true (default): in-memory demo store, no database needed.
 * - USE_DEMO_DATA=false: real PostgreSQL via Prisma (dbstore).
 *
 * The Prisma module is loaded lazily so demo mode never touches the pg
 * driver. The backend is resolved per call, so flipping the env var takes
 * effect without re-importing.
 */
import * as demo from "./demo";

type Backend = typeof demo;

async function backend(): Promise<Backend> {
  if (process.env.USE_DEMO_DATA !== "false") return demo;
  return import("./dbstore");
}

export function findUserByLogin(...args: Parameters<Backend["findUserByLogin"]>) {
  return backend().then((b) => b.findUserByLogin(...args));
}

export function listUsers(...args: Parameters<Backend["listUsers"]>) {
  return backend().then((b) => b.listUsers(...args));
}

export function upgradePasswordHash(...args: Parameters<Backend["upgradePasswordHash"]>) {
  return backend().then((b) => b.upgradePasswordHash(...args));
}

export function setUserActive(...args: Parameters<Backend["setUserActive"]>) {
  return backend().then((b) => b.setUserActive(...args));
}

export function createUser(...args: Parameters<Backend["createUser"]>) {
  return backend().then((b) => b.createUser(...args));
}

export function updateUser(...args: Parameters<Backend["updateUser"]>) {
  return backend().then((b) => b.updateUser(...args));
}

export function listPeople(...args: Parameters<Backend["listPeople"]>) {
  return backend().then((b) => b.listPeople(...args));
}

export function getPerson(...args: Parameters<Backend["getPerson"]>) {
  return backend().then((b) => b.getPerson(...args));
}

export function listProjects(...args: Parameters<Backend["listProjects"]>) {
  return backend().then((b) => b.listProjects(...args));
}

export function getProject(...args: Parameters<Backend["getProject"]>) {
  return backend().then((b) => b.getProject(...args));
}

export function createPerson(...args: Parameters<Backend["createPerson"]>) {
  return backend().then((b) => b.createPerson(...args));
}

export function updatePerson(...args: Parameters<Backend["updatePerson"]>) {
  return backend().then((b) => b.updatePerson(...args));
}

export function createProject(...args: Parameters<Backend["createProject"]>) {
  return backend().then((b) => b.createProject(...args));
}

export function updateProject(...args: Parameters<Backend["updateProject"]>) {
  return backend().then((b) => b.updateProject(...args));
}

export function listWeeks(...args: Parameters<Backend["listWeeks"]>) {
  return backend().then((b) => b.listWeeks(...args));
}

export function recordWeekPayments(...args: Parameters<Backend["recordWeekPayments"]>) {
  return backend().then((b) => b.recordWeekPayments(...args));
}

export function voidWeekPayment(...args: Parameters<Backend["voidWeekPayment"]>) {
  return backend().then((b) => b.voidWeekPayment(...args));
}

export function assignPersonToProject(...args: Parameters<Backend["assignPersonToProject"]>) {
  return backend().then((b) => b.assignPersonToProject(...args));
}

export function unassignPersonFromProject(...args: Parameters<Backend["unassignPersonFromProject"]>) {
  return backend().then((b) => b.unassignPersonFromProject(...args));
}

export function getProjectTeam(...args: Parameters<Backend["getProjectTeam"]>) {
  return backend().then((b) => b.getProjectTeam(...args));
}

export function deletePerson(...args: Parameters<Backend["deletePerson"]>) {
  return backend().then((b) => b.deletePerson(...args));
}

export function listAttendance(...args: Parameters<Backend["listAttendance"]>) {
  return backend().then((b) => b.listAttendance(...args));
}

export function recordAttendanceBatch(...args: Parameters<Backend["recordAttendanceBatch"]>) {
  return backend().then((b) => b.recordAttendanceBatch(...args));
}

export function getPersonDetail(...args: Parameters<Backend["getPersonDetail"]>) {
  return backend().then((b) => b.getPersonDetail(...args));
}

export { isDemoMode } from "./demo";
export type { AttendanceInput, Role } from "./demo";
