/* tslint:disable:no-unused-variable */

import { TestBed, async, inject } from '@angular/core/testing';
import { ChainService } from './chain.service';

describe('ChainService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ChainService]
    });
  });

  it('should ...', inject([ChainService], (service: ChainService) => {
    expect(service).toBeTruthy();
  }));
});
