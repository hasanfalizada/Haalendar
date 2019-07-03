import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { TrashDialogComponent } from './trash-dialog.component';

describe('TrashDialogComponent', () => {
  let component: TrashDialogComponent;
  let fixture: ComponentFixture<TrashDialogComponent>;

  beforeEach(async(() => {
    TestBed.configureTestingModule({
      declarations: [ TrashDialogComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(TrashDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
