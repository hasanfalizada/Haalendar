import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialogModule } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatMomentDateModule } from '@angular/material-moment-adapter';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HeaderComponent } from './header/header.component';
import { EventslistComponent } from './eventslist/eventslist.component';
import { MatListModule } from '@angular/material/list';
import { HttpClientModule } from '@angular/common/http';
import { CreateEventDialogComponent } from './create-event-dialog/create-event-dialog.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ObserversModule } from '@angular/cdk/observers';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { SidenavComponent } from './sidenav/sidenav.component';
import { DateproviderService } from './dateprovider.service';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { HelpDialogComponent } from './help-dialog/help-dialog.component';
import { MatRadioModule } from '@angular/material/radio';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { ConfirmationDialogComponent } from './confirmation-dialog/confirmation-dialog.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { TrashDialogComponent } from './trash-dialog/trash-dialog.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';


@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    EventslistComponent,
    CreateEventDialogComponent,
    SidenavComponent,
    HelpDialogComponent,
    ConfirmationDialogComponent,
    TrashDialogComponent
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    MatToolbarModule,
    MatListModule,
    HttpClientModule,
    FormsModule,
    ObserversModule,
    MatDialogModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatSelectModule,
    MatSnackBarModule,
    MatSidenavModule,
    MatCheckboxModule,
    MatMomentDateModule,
    ReactiveFormsModule,
    MatTooltipModule,
    MatButtonToggleModule,
    MatRadioModule,
    MatChipsModule,
    MatMenuModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  providers: [EventslistComponent, SidenavComponent, HeaderComponent, AppComponent, DateproviderService],
  bootstrap: [AppComponent],
  entryComponents: [CreateEventDialogComponent, HelpDialogComponent, ConfirmationDialogComponent, TrashDialogComponent]
})
export class AppModule { }
