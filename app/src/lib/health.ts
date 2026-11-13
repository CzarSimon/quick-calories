/**
 * Apple Health: read-only access to body weight.
 *
 * The app never writes to Health. Only iOS has it; everywhere else these functions report
 * "unsupported" and return no data. Health data is also unreadable while the phone is locked,
 * so every read can come back empty and callers fall back to the last weight used.
 */

import {
  AuthorizationRequestStatus,
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  queryQuantitySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Platform } from 'react-native';

import { addDays, averageWeight, toIsoDate, type Microcycle } from '@/domain';

const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass' as const;
const READ = { toRead: [BODY_MASS] } as const;

export type HealthStatus = 'unsupported' | 'not-asked' | 'asked';

function available(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

/**
 * Whether the user has been asked for access. iOS does not reveal whether read access was
 * granted, only whether the question was asked; a denied read simply returns no samples.
 */
export async function healthStatus(): Promise<HealthStatus> {
  if (!available()) return 'unsupported';
  try {
    const status = await getRequestStatusForAuthorization(READ);
    return status === AuthorizationRequestStatus.unnecessary ? 'asked' : 'not-asked';
  } catch {
    return 'not-asked';
  }
}

/** Show the Health permission sheet if it has not been shown yet. */
export async function requestWeightAccess(): Promise<HealthStatus> {
  if (!available()) return 'unsupported';
  try {
    await requestAuthorization(READ);
  } catch {
    // Dismissed or failed: status below tells.
  }
  return healthStatus();
}

function localMidnight(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

/**
 * The average body weight over a microcycle, from Apple Health, or null when there is no data
 * (no weigh-ins, no access, or the phone is locked). With `mayAsk`, asks for access first when
 * the user has not been asked yet; never asks otherwise.
 */
export async function averageWeightFromHealth(microcycle: Microcycle, { mayAsk }: { mayAsk: boolean }): Promise<number | null> {
  if (!available()) return null;
  try {
    let status = await healthStatus();
    if (status === 'not-asked' && mayAsk) status = await requestWeightAccess();
    if (status !== 'asked') return null;

    const samples = await queryQuantitySamples(BODY_MASS, {
      unit: 'kg',
      limit: 0,
      ascending: true,
      filter: {
        date: {
          startDate: localMidnight(microcycle.startDate),
          endDate: localMidnight(addDays(microcycle.startDate, microcycle.length)),
          strictStartDate: true,
        },
      },
    });
    return averageWeight(
      samples.map((sample) => ({ date: toIsoDate(sample.startDate), kg: sample.quantity })),
      microcycle,
    );
  } catch {
    return null;
  }
}
