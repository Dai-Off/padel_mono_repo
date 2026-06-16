export type CoachDrillSlot = 'low1' | 'low2' | 'med1' | 'med2' | 'high1' | 'high2';

export type CoachDrillEntry = {
  name: string;
  duration: string;
  sets: string;
};

export type CoachDrillsCategoryKeys = Record<CoachDrillSlot, CoachDrillEntry>;

export type CoachDrillsTranslationKeys = {
  technical: CoachDrillsCategoryKeys;
  physical: CoachDrillsCategoryKeys;
  mental: CoachDrillsCategoryKeys;
  tactical: CoachDrillsCategoryKeys;
};
