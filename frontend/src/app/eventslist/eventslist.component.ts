import { Component, OnInit, ViewChild, TemplateRef, ViewContainerRef, ElementRef, HostListener } from '@angular/core';
import { DataproviderService } from '../dataprovider.service';
import { DateproviderService } from '../dateprovider.service';
import { OverlayRef, Overlay } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Subscription, fromEvent } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CreateEventDialogComponent } from '../create-event-dialog/create-event-dialog.component';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-eventslist',
  templateUrl: './eventslist.component.html',
  styleUrls: ['./eventslist.component.css']
})
export class EventslistComponent implements OnInit {

  events: any = [];
  clonedEvent: number;
  selectedRow: number;
  selectedEventId: string;
  selection: boolean;

  @ViewChild('details', {static: false}) details: TemplateRef<any>;
  @ViewChild('list-item', {static: false}) listItem: ElementRef;

  overlayRef: OverlayRef | null;

  sub: Subscription;

  dialogRef: any;

  constructor(
    public dataprovider: DataproviderService,
    public overlay: Overlay,
    public viewContainerRef: ViewContainerRef,
    private eRef: ElementRef,
    private dt: DateproviderService,
    private snackBar: MatSnackBar,
    public dialog: MatDialog
  ) { }

  ngOnInit() {
    this.today();
  }

  today() {
    this.dataprovider.today
      ().subscribe((data: {}) => {
        this.events = data;
      });
  }

  setClickedRow(index): void {
    this.selection = true;
    this.selectedRow = index;
  }

  setSelectedEventId(eventId: string): void {
    this.selectedEventId = eventId;
  }

  openCreateEventDialog(selectedEventId: number): void {

    this.dataprovider.setCurrentEvent(selectedEventId);

    if (this.dialogRef) {
      this.snackBar.open('You\'re already here!', 'Ok', {
        duration: 2000
      });
      return;
    }
    this.dialogRef = this.dialog.open(CreateEventDialogComponent);
    this.dialogRef.afterClosed().subscribe(result => {
      this.dialogRef = null;
    });
  }

  openDetails({ x, y }: MouseEvent, listEvent) {
    this.close();
    const positionStrategy = this.overlay.position()
      .flexibleConnectedTo({ x, y })
      .withPositions([
        {
          originX: 'end',
          originY: 'bottom',
          overlayX: 'start',
          overlayY: 'top',
        }
      ]);

    this.overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.close()
    });

    this.overlayRef.attach(new TemplatePortal(this.details, this.viewContainerRef, {
      $implicit: listEvent
    }));

    this.sub = fromEvent<MouseEvent>(document, 'click')
      .pipe(
        filter(event => {
          if (!this.eRef.nativeElement.contains(event.target)) {
            this.selection = false;
          }
          return !this.eRef.nativeElement.contains(event.target);
        }),
        take(1)
      ).subscribe(() => this.close());
  }

  close() {
    // tslint:disable-next-line:no-unused-expression
    this.sub && this.sub.unsubscribe();
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  deleteEvent(eventId: string, mode: string, withoutConfirmation: boolean = false): void {
    if (withoutConfirmation) {
      this.dataprovider.deleteEvent(eventId, mode, this.dt.getDateRequestedString()).subscribe((data: {}) => {
      });
    } else {
      this.dialogRef = this.dialog.open(ConfirmationDialogComponent);
      this.dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.dataprovider.deleteEvent(eventId, mode, this.dt.getDateRequestedString()).subscribe((data: {}) => {
          });
        }
        this.dialogRef = null;
      });
    }
  }

  updateSingleEvent(eventId: string): void {
    this.dt.setSingleEventEdit();
    this.dataprovider.cloneEvent(eventId).subscribe((data: { clonedEventId: number }) => {
      this.deleteEvent(eventId, '0', true);
      this.openCreateEventDialog(data.clonedEventId);
    });
  }

  @HostListener('document:keyup', ['$event'])
  handleDeleteKeyboardEvent(event: KeyboardEvent) {
    if (this.selection && event.key === 'Delete') { this.deleteEvent(this.selectedEventId, '0'); }
  }
}
