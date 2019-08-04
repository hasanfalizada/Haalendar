import { Component, ViewChild, ElementRef } from '@angular/core';
import { MatSidenav } from '@angular/material/sidenav';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'Haalendar';
  sideNavOpened = true;

  @ViewChild('sidenav', { static: false }) sidenav: MatSidenav;

  toggleSidenav(): void {
    this.sidenav.toggle();
  }
}
