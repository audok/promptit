import { geminiLiveSite } from './liveSiteAdapters';
import { createLiveSmokeSuite, test } from './liveSmokeFlow';

const suite = createLiveSmokeSuite(geminiLiveSite);

test.describe(suite.title, () => {
  for (const liveTest of suite.tests) {
    test(liveTest.title, liveTest.run);
  }
});
