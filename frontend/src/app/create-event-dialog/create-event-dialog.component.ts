import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { DataproviderService } from '../dataprovider.service';
import { DateproviderService } from '../dateprovider.service';

@Component({
  templateUrl: './create-event-dialog.component.html',
  styleUrls: ['./create-event-dialog.component.css']
})

export class CreateEventDialogComponent implements OnInit {

  constructor(
    public dialogRef: MatDialogRef<CreateEventDialogComponent>,
    public dataprovider: DataproviderService,
    public dt: DateproviderService,
    private snackBar: MatSnackBar,
  ) { }

  colors: any = [];
  dialogTitle: string;
  dialogSaveButtonLabel: string;
  title: string;
  datefrom = new Date(this.dt.getCurrentDate());
  timefrom = '';
  dateto = new Date(this.dt.getCurrentDate());
  timeto = '';
  allday = true;
  location: string;
  eventColor: number;
  description: string;
  repeat = 0;

  isEdit: boolean;

  ngOnInit() {
    this.getColors();
    this.fillEvent();
  }

  fillEvent(): void {
    this.dataprovider.getEventById(this.dataprovider.getCurrentEvent()).subscribe((data: {}) => {
      if ((data as Array<any>).length === 1) {
        this.isEdit = true;
        this.dialogTitle = 'Edit event';
        this.dialogSaveButtonLabel = 'Save';
        this.title = data[0].title;
        this.datefrom = this.dt.isSingleEventEdit ? new Date(this.dt.getCurrentDate()) : new Date(data[0].datefrom);
        this.timefrom = data[0].timefrom;
        this.dateto = this.dt.isSingleEventEdit ? new Date(this.dt.getCurrentDate()) : new Date(data[0].dateto);
        this.timeto = data[0].timeto;
        this.allday = data[0].allday === 1 ? true : false;
        this.location = data[0].location;
        this.eventColor = data[0].colorid;
        this.description = data[0].description;
        this.repeat = data[0].daily === 1 ? 1 : data[0].weekly === 1 ? 2 : data[0].monthly === 1 ? 3 : data[0].annually === 1 ? 4 : 0;
      } else {
        this.dialogTitle = 'New event';
        this.dialogSaveButtonLabel = 'Create';
      }
    });
  }

  getColors() {
    this.dataprovider.getColors().subscribe((data: {}) => {
      this.colors = data;
    });
  }

  onAllDayToggleChange(): void {
    this.allday = !this.allday;
  }

  onNoClick(): void {
    if (this.dt.isSingleEventEdit) {
      this.onYesClick();
      return;
    }
    this.dialogRef.close();
  }

  createLocalFormattedDateString(dt: Date): string {
    const year = new Date(dt).getFullYear();
    const month =
      (new Date(dt).getMonth() + 1) < 10
        ? '0' + (new Date(dt).getMonth() + 1)
        : (new Date(dt).getMonth() + 1);
    const day =
      new Date(dt).getDate() < 10
        ? '0' + new Date(dt).getDate()
        : new Date(dt).getDate();
    return year + `-` + month + `-` + day;
  }

  onYesClick(): void {
    if (
      ((this.timefrom === undefined || this.timefrom === null || this.timefrom === '')
        ? this.datefrom
        : new Date(this.createLocalFormattedDateString(this.datefrom) + `T` + this.timefrom + `:00`))
      >
      ((this.timeto === undefined || this.timeto === null || this.timeto === '')
        ? this.dateto
        : new Date(this.createLocalFormattedDateString(this.dateto) + `T` + this.timeto + `:00`))
    ) {
      this.snackBar.open('To (date) cannot be earlier than From (date)!', 'Ok', {
        duration: 2000
      });
      return;
    }
    if (this.isEdit) {
      if (this.allday) {
        this.timefrom = '';
        this.timeto = '';
      }
      this.dataprovider.updateEvent(
        this.dataprovider.getCurrentEvent(),
        this.title === undefined || this.title === null || this.title === '' ? '(No title)' : this.title,
        this.createLocalFormattedDateString(this.datefrom),
        this.timefrom === undefined || this.timefrom === null || this.timefrom === '' ? '' : this.timefrom,
        this.createLocalFormattedDateString(this.dateto),
        this.timeto === undefined || this.timeto === null || this.timeto === '' ? '' : this.timeto,
        this.allday ? 1 : 0,
        this.location === undefined || this.location === null || this.location === '' ? '' : this.location,
        this.eventColor === undefined ? 6 : this.eventColor,
        this.description === undefined || this.description === null || this.description === '' ? '' : this.description,
        this.repeat).subscribe((data: {}) => {
        });
    } else {
      this.dataprovider.createEvent(
        this.title === undefined ? '(No title)' : this.title,
        this.createLocalFormattedDateString(this.datefrom),
        this.timefrom === undefined ? '' : this.timefrom,
        this.createLocalFormattedDateString(this.dateto),
        this.timeto === undefined ? '' : this.timeto,
        this.allday ? 1 : 0,
        this.location === undefined ? '' : this.location,
        this.eventColor === undefined ? 6 : this.eventColor,
        this.description === undefined ? '' : this.description,
        this.repeat).subscribe((data: {}) => {
        });
    }
    if (this.dt.isSingleEventEdit) {
      this.dt.declineSingleEventEdit();
    }
    this.dialogRef.close();
  }

  syncDates(): void {
    if (
      ((this.timefrom === undefined || this.timefrom === null || this.timefrom === '')
        ? this.datefrom
        : new Date(this.createLocalFormattedDateString(this.datefrom) + `T` + this.timefrom + `:00`))
      >
      ((this.timeto === undefined || this.timeto === null || this.timeto === '')
        ? this.dateto
        : new Date(this.createLocalFormattedDateString(this.dateto) + `T` + this.timeto + `:00`))
    ) {
      this.dateto = this.datefrom;
    }
  }
}
