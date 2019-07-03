import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DateproviderService {

  months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'];

  constructor() {
    setInterval(() => {
      this.now = this.months[new Date().getMonth()]
        + ' ' + new Date().getDate()
        + ', ' + new Date().getFullYear()
        + ' ' + (new Date().getHours() < 10 ? '0' + new Date().getHours() : new Date().getHours())
        + ':' + (new Date().getMinutes() < 10 ? '0' + new Date().getMinutes() : new Date().getMinutes())
        + ':' + (new Date().getSeconds() < 10 ? '0' + new Date().getSeconds() : new Date().getSeconds());
    }, 1);
  }

  currentDate = new Date();
  isSingleEventEdit = false;
  now: string;

  getCurrentDate(): Date {
    return this.currentDate;
  }

  getWeekNumber(): number {
    // Source: https://weeknumber.net/how-to/javascript
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000
      - 3 + (week1.getDay() + 6) % 7) / 7);
  }

  getCurrentFormattedDate(): string {
    if (new Date(this.currentDate).getFullYear() === new Date().getFullYear() &&
      new Date(this.currentDate).getMonth() === new Date().getMonth() &&
      new Date(this.currentDate).getDate() === new Date().getDate()) {
      return 'today';
    }
    const currentDateTime = this.currentDate;
    const currentDateTimeString =
      this.months[new Date(currentDateTime).getMonth()]
      + ' ' + new Date(currentDateTime).getDate()
      + ', ' + new Date(currentDateTime).getFullYear();
    return currentDateTimeString;
  }

  getDateRequestedString(): string {
    const year = new Date(this.currentDate).getFullYear();
    const month =
      (new Date(this.currentDate).getMonth() + 1) < 10
        ? '0' + (new Date(this.currentDate).getMonth() + 1)
        : (new Date(this.currentDate).getMonth() + 1);
    const day =
      new Date(this.currentDate).getDate() < 10
        ? '0' + new Date(this.currentDate).getDate()
        : new Date(this.currentDate).getDate();
    return year + '-' + month + '-' + day;
  }

  today() {
    this.currentDate = new Date();

  }

  setCurrentDate(newDate: Date) {
    this.currentDate = newDate;
  }

  previousDay(): void {
    const localDate = new Date(this.currentDate);
    localDate.setDate(new Date(this.currentDate).getDate() - 1);
    this.currentDate = localDate;
  }

  nextDay(): void {
    const localDate = new Date(this.currentDate);
    localDate.setDate(new Date(this.currentDate).getDate() + 1);
    this.currentDate = localDate;
  }

  getFormattedDate(dateString: string): string {
    const currentDateTime = new Date(dateString);
    const currentDateTimeString =
      this.months[new Date(currentDateTime).getMonth()]
      + ' ' + new Date(currentDateTime).getDate()
      + ', ' + new Date(currentDateTime).getFullYear();
    return currentDateTimeString;
  }

  getTimePositions(): string[] {
    return [
      '00:00',
      '00:15',
      '00:30',
      '00:45',
      '01:00',
      '01:15',
      '01:30',
      '01:45',
      '02:00',
      '02:15',
      '02:30',
      '02:45',
      '03:00',
      '03:15',
      '03:30',
      '03:45',
      '04:00',
      '04:15',
      '04:30',
      '04:45',
      '05:00',
      '05:15',
      '05:30',
      '05:45',
      '06:00',
      '06:15',
      '06:30',
      '06:45',
      '07:00',
      '07:15',
      '07:30',
      '07:45',
      '08:00',
      '08:15',
      '08:30',
      '08:45',
      '09:00',
      '09:15',
      '09:30',
      '09:45',
      '10:00',
      '10:15',
      '10:30',
      '10:45',
      '11:00',
      '11:15',
      '11:30',
      '11:45',
      '12:00',
      '12:15',
      '12:30',
      '12:45',
      '13:00',
      '13:15',
      '13:30',
      '13:45',
      '14:00',
      '14:15',
      '14:30',
      '14:45',
      '15:00',
      '15:15',
      '15:30',
      '15:45',
      '16:00',
      '16:15',
      '16:30',
      '16:45',
      '17:00',
      '17:15',
      '17:30',
      '17:45',
      '18:00',
      '18:15',
      '18:30',
      '18:45',
      '19:00',
      '19:15',
      '19:30',
      '19:45',
      '20:00',
      '20:15',
      '20:30',
      '20:45',
      '21:00',
      '21:15',
      '21:30',
      '21:45',
      '22:00',
      '22:15',
      '22:30',
      '22:45',
      '23:00',
      '23:15',
      '23:30',
      '23:45'
    ];
  }

  setSingleEventEdit(): void {
    this.isSingleEventEdit = true;
  }

  declineSingleEventEdit(): void {
    this.isSingleEventEdit = false;
  }

  isValidDateString(dateString: string): boolean {
    const correctDatePattern = new RegExp(/^(-?(?:[1-9][0-9]*)?[0-9]{4})-(1[0-2]|0[1-9])-(3[01]|0[1-9]|[12][0-9])$/);
    return correctDatePattern.test(dateString);
  }
}
