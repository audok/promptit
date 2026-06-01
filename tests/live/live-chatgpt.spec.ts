import { chatgptLiveSite } from './liveSiteAdapters';
import { createLiveSmokeSuite, test } from './liveSmokeFlow';

const suite = createLiveSmokeSuite(chatgptLiveSite);

test.describe(suite.title, () => {
  for (const liveTest of suite.tests) {
    test(liveTest.title, liveTest.run);
  }
});
