import { OpenfundPage } from './app.po';

describe('openfund App', function() {
  let page: OpenfundPage;

  beforeEach(() => {
    page = new OpenfundPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
