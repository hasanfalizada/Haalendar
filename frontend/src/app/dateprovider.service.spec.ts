import { TestBed } from '@angular/core/testing';

import { DateproviderService } from './dateprovider.service';

describe('DateproviderService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: DateproviderService = TestBed.get(DateproviderService);
    expect(service).toBeTruthy();
  });
});
