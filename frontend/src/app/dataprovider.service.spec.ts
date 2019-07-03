import { TestBed } from '@angular/core/testing';

import { DataproviderService } from './dataprovider.service';

describe('DataproviderService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: DataproviderService = TestBed.get(DataproviderService);
    expect(service).toBeTruthy();
  });
});
