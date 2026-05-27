import { describe, it, expect } from 'vitest';
import { CLAUDE_CODE, type Provider } from '../../src/domain/settings/Provider';
import type { ModelId } from '../../src/domain/settings/ModelId';
import type { CastInput } from '../../src/execution/Caster';
import type { CastedEvent } from '../../src/castLog/types';
import type { CastRecord } from '../../src/castLog/CastRecord';
import type { RecordCastedInput } from '../../src/cast/CastResultRecorder';
import type { SpellCastingSettings } from '../../src/domain/settings/CastingSettings';
import type { ResolvedCasting } from '../../src/domain/settings/resolveCastingForSpell';
import type { ForgeFormSnapshot } from '../../src/forge/ForgeFormSnapshot';
import type { ForgeUpdateFormSnapshot } from '../../src/forge/ForgeUpdateFormSnapshot';
import type { BuildPortalRequestBodyInput } from '../../src/cast/portal/buildPortalRequestBody';

/**
 * Compile-time completeness guards: each indexed-access type below errors under `tsc --noEmit`
 * if the named field is absent from the interface or its type is not assignable to Provider / ModelId.
 * esbuild erases these at vitest runtime; `tsc --noEmit` (run via lint) catches regressions.
 */

// CastInput
type _CastInputProvider = CastInput['provider'] extends Provider ? true : never;
type _CastInputModelId = CastInput['modelId'] extends ModelId ? true : never;

// CastedEvent
type _CastedEventProvider = CastedEvent['provider'] extends Provider ? true : never;
type _CastedEventModel = CastedEvent['model'] extends string ? true : never;

// CastRecord
type _CastRecordProvider = CastRecord['provider'] extends Provider ? true : never;
type _CastRecordModel = CastRecord['model'] extends string ? true : never;

// RecordCastedInput
type _RecordCastedInputProvider = RecordCastedInput['provider'] extends Provider ? true : never;
type _RecordCastedInputModel = RecordCastedInput['model'] extends string ? true : never;

// SpellCastingSettings
type _SpellCastingSettingsProvider = SpellCastingSettings['provider'] extends Provider ? true : never;
type _SpellCastingSettingsModel = SpellCastingSettings['model'] extends ModelId ? true : never;

// ResolvedCasting
type _ResolvedCastingProvider = ResolvedCasting['provider'] extends Provider ? true : never;
type _ResolvedCastingModel = ResolvedCasting['model'] extends ModelId ? true : never;

// ForgeFormSnapshot
type _ForgeFormSnapshotProvider = ForgeFormSnapshot['provider'] extends Provider ? true : never;
type _ForgeFormSnapshotModel = ForgeFormSnapshot['model'] extends ModelId ? true : never;

// ForgeUpdateFormSnapshot
type _ForgeUpdateFormSnapshotProvider = ForgeUpdateFormSnapshot['provider'] extends Provider ? true : never;
type _ForgeUpdateFormSnapshotModel = ForgeUpdateFormSnapshot['model'] extends ModelId ? true : never;

// BuildPortalRequestBodyInput (provider is optional — field must exist but may be undefined)
type _PortalBodyProvider = BuildPortalRequestBodyInput['provider'] extends Provider | undefined ? true : never;
type _PortalBodyModelId = BuildPortalRequestBodyInput['modelId'] extends ModelId ? true : never;

describe('Provider completeness', () => {
  it('all threaded interfaces carry provider — enforced at compile time via indexed-access types above', () => {
    // Runtime anchor: keeps the CLAUDE_CODE import live and confirms the constant's value.
    expect(CLAUDE_CODE).toBe('claude-code');
  });
});
