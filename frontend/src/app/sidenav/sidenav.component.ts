import { Component, OnInit, ViewChild, ViewContainerRef, TemplateRef, HostListener } from '@angular/core';
import { DateproviderService } from '../dateprovider.service';
import { DataproviderService } from '../dataprovider.service';
import { DateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { CreateEventDialogComponent } from '../create-event-dialog/create-event-dialog.component';
import { HelpDialogComponent } from '../help-dialog/help-dialog.component';
import { TrashDialogComponent } from '../trash-dialog/trash-dialog.component';

@Component({
  selector: 'app-sidenav',
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.css']
})
export class SidenavComponent implements OnInit {

  @ViewChild('outlet', { read: ViewContainerRef, static: true }) outletRef: ViewContainerRef;
  @ViewChild('content', { read: TemplateRef, static: true }) contentRef: TemplateRef<any>;

  dialogRef: any;
  expiredEventsCount: number;

  constructor(
    private dt: DateproviderService,
    private adapter: DateAdapter<any>,
    public dialog: MatDialog,
    private data: DataproviderService) { }

  ngOnInit() {
    this.adapter.setLocale('en-GB');
    this.setExpiredEventsCount();
  }

  // tslint:disable-next-line:use-life-cycle-interface
  ngAfterContentInit() {
    this.outletRef.createEmbeddedView(this.contentRef);
  }

  public rerender() {
    this.outletRef.clear();
    this.outletRef.createEmbeddedView(this.contentRef);
  }

  today(): void {
    this.dt.today();
    this.rerender();
    this.setExpiredEventsCount();
  }

  previousDay(): void {
    this.dt.previousDay();
    this.rerender();
  }

  nextDay(): void {
    this.dt.nextDay();
    this.rerender();
  }
  openCreateEventDialog(): void {

    this.data.setCurrentEvent(null);
    this.dialogRef = this.dialog.open(CreateEventDialogComponent);
    this.dialogRef.afterClosed().subscribe(result => {
      this.dialogRef = null;
    });
  }

  openHelpDialog(): void {
    this.dialogRef = this.dialog.open(HelpDialogComponent);
    this.dialogRef.afterClosed().subscribe(result => {
      this.dialogRef = null;
    });
  }

  openTrashDialog(): void {
    this.dialogRef = this.dialog.open(TrashDialogComponent);
    this.dialogRef.afterClosed().subscribe(result => {
      this.dialogRef = null;
    });
  }

  setExpiredEventsCount(): void {
    this.data.getExpiredEventsCount().subscribe((data: { expiredEventsCount: number }) => {
      this.expiredEventsCount = data.expiredEventsCount;
    });
  }

}
