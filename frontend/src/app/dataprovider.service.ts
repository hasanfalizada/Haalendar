import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, interval } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { DateproviderService } from './dateprovider.service';

@Injectable({
  providedIn: 'root'
})
export class DataproviderService {

  constructor(private http: HttpClient, private dt: DateproviderService) {
  }

  endpoint = 'http://localhost/haalendar/backend/rest.php?op=';

  currentEvent: number;

  httpOptions = {
    headers: new HttpHeaders({
      'Content-Type': 'application/json'
    })
  };

  private extractData(res: Response) {
    const body = res;
    return body || {};
  }

  today(): Observable<any> {
    const result = interval(1000).pipe(
      switchMap(() => this.http.get(this.endpoint + 'today&daterequested=' + this.dt.getDateRequestedString())),
      map(this.extractData));
    return result;
  }


  getColors(): Observable<any> {
    return this.http.get(this.endpoint + 'getColors').pipe(
      map(this.extractData));
  }

  getEventById(requestedEventId: number): Observable<any> {
    return this.http.get(this.endpoint + 'getEventById&requestedEventId=' + requestedEventId).pipe(
      map(this.extractData));
  }

  createEvent(
    title: string,
    datefrom: string,
    timefrom: string,
    dateto: string,
    timeto: string,
    allday: number,
    location: string,
    color: number,
    description: string,
    repeat: number
  ): Observable<any> {
    return this.http.get(this.endpoint +
      `createEvent` +
      `${title === '' ? '' : '&title=' + this.sanitize(title)}` +
      `${datefrom === '' ? '' : '&datefrom=' + datefrom}` +
      `${timefrom === '' ? '' : '&timefrom=' + timefrom}` +
      `${dateto === '' ? '' : '&dateto=' + dateto}` +
      `${timeto === '' ? '' : '&timeto=' + timeto}` +
      `&allday=${allday}` +
      `${location === '' ? '' : '&location=' + this.sanitize(location)}` +
      `&color=${color}` +
      `${description === '' ? '' : '&description=' + this.sanitize(description)}` +
      `&repeat=${repeat}`).pipe(
        map(this.extractData));
  }

  deleteEvent(
    requestedEventId: string,
    allEvents: string,
    requestedDate: string
  ): Observable<any> {
    return this.http.get(this.endpoint +
      `deleteEvent` +
      `${requestedEventId === '' ? '' : '&requestedEventId=' + requestedEventId}` +
      `${allEvents === '' ? '' : '&allEvents=' + allEvents}` +
      `${requestedDate === '' ? '' : '&requestedDate=' + requestedDate}`).pipe(
        map(this.extractData));
  }

  cloneEvent(
    eventId: string,
  ): Observable<any> {
    return this.http.get(this.endpoint +
      `cloneEvent` +
      `${eventId === '' ? '' : '&eventId=' + eventId}`).pipe(
        map(this.extractData));
  }

  updateEvent(
    eventId: number,
    title: string,
    datefrom: string,
    timefrom: string,
    dateto: string,
    timeto: string,
    allday: number,
    location: string,
    color: number,
    description: string,
    repeat: number
  ): Observable<any> {
    return this.http.get(this.endpoint +
      `updateEvent` +
      `${eventId === undefined ? '' : '&eventId=' + eventId}` +
      `${title === '' ? '' : '&title=' + this.sanitize(title)}` +
      `${datefrom === '' ? '' : '&datefrom=' + datefrom}` +
      `${timefrom === '' ? '' : '&timefrom=' + timefrom}` +
      `${dateto === '' ? '' : '&dateto=' + dateto}` +
      `${timeto === '' ? '' : '&timeto=' + timeto}` +
      `&allday=${allday}` +
      `${location === '' ? '' : '&location=' + this.sanitize(location)}` +
      `&color=${color}` +
      `${description === '' ? '' : '&description=' + this.sanitize(description)}` +
      `&repeat=${repeat}`).pipe(
        map(this.extractData));
  }

  setCurrentEvent(currentEventId: number): void {
    this.currentEvent = currentEventId;
  }

  getCurrentEvent(): number {
    return this.currentEvent;
  }

  sanitize(input: string) {
    return input.replace(/&/g, '%26')
      .replace(/"/g, '%22')
      .replace(/'/g, '%22')
      .replace(/</g, '%3C')
      .replace(/>/g, '%3E')
      .replace(/\+/g, '%2B')
      .replace(/#/g, '%23')
      .replace(/\n/g, '%0A');
  }

  getActiveEvents(): Observable<any> {
    const result = interval(1000).pipe(
      switchMap(() => this.http.get(this.endpoint + 'getActiveEvents')),
      map(this.extractData));
    return result;
  }

  trash(): Observable<any> {
    return this.http.get(this.endpoint + 'trash').pipe(
      map(this.extractData));
  }

  restoreEvent(
    eventId: string
  ): Observable<any> {
    return this.http.get(this.endpoint +
      `restoreEvent` +
      `${eventId === '' ? '' : '&eventId=' + eventId}`).pipe(
        map(this.extractData));
  }

  getExpiredEventsCount(): Observable<any> {
    return this.http.get(this.endpoint + 'getExpiredEvents&daterequested=' + this.dt.getDateRequestedString()).pipe(
      map(this.extractData));
  }
}
